import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/clients";
import { createPayRun } from "@/lib/pay-runs";
import { buildStorageKey, createImport } from "@/lib/imports";
import {
  approvePayRun,
  getReviewGateStatus,
  rejectPayRun,
  submitPayRunForReview
} from "@/lib/pay-run-review";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createFirmWithUser, resetDb } from "./test-db";

const createMappedImport = async ({
  firmId,
  userId,
  userRole,
  clientId,
  payRunId,
  sourceType
}: {
  firmId: string;
  userId: string;
  userRole: "ADMIN" | "PREPARER" | "REVIEWER";
  clientId: string;
  payRunId: string;
  sourceType: "REGISTER" | "BANK" | "GL";
}) => {
  const storageKey = buildStorageKey(firmId, payRunId, sourceType, `${sourceType}.csv`);
  const result = await createImport(
    { firmId, userId, role: userRole },
    {
      payRunId,
      sourceType,
      storageKey,
      fileHashSha256: `${sourceType}-hash`,
      originalFilename: `${sourceType}.csv`,
      mimeType: "text/csv",
      sizeBytes: 120
    }
  );

  const template = await prisma.mappingTemplate.create({
    data: {
      firmId,
      clientId,
      sourceType,
      name: `${sourceType} template`,
      version: 1,
      status: "ACTIVE",
      sourceColumns: ["col1", "col2"],
      columnMap: {},
      createdByUserId: userId
    }
  });

  await prisma.import.update({
    where: { id: result.importRecord.id },
    data: { mappingTemplateVersionId: template.id }
  });

  return result.importRecord;
};

const createCriticalException = async ({
  firmId,
  payRunId,
  userId
}: {
  firmId: string;
  payRunId: string;
  userId: string;
}) => {
  const run = await prisma.reconciliationRun.create({
    data: {
      firmId,
      payRunId,
      runNumber: 1,
      bundleId: "BUNDLE_UK_V1",
      bundleVersion: "v1",
      status: "SUCCESS",
      inputSummary: {},
      executedByUserId: userId
    }
  });

  const checkResult = await prisma.checkResult.create({
    data: {
      reconciliationRunId: run.id,
      checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
      checkVersion: "v1",
      status: "FAIL",
      severity: "CRITICAL",
      summary: "Critical mismatch",
      details: {
        leftLabel: "Register net total",
        rightLabel: "Bank total",
        leftValue: 1200,
        rightValue: 800,
        deltaValue: 400,
        deltaPercent: 33.33,
        formula: "Register - Bank",
        toleranceApplied: { absolute: 1, percent: 0.1, applied: 1 }
      }
    }
  });

  return prisma.exception.create({
    data: {
      firmId,
      payRunId,
      reconciliationRunId: run.id,
      checkResultId: checkResult.id,
      category: "BANK_MISMATCH",
      severity: "CRITICAL",
      status: "OPEN",
      title: "Critical mismatch",
      description: "Totals are out of tolerance."
    }
  });
};

describe("pay run review flow", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("reports missing and unmapped sources", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Review Gate",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-09-01T00:00:00Z"),
        periodEnd: new Date("2026-09-30T00:00:00Z")
      }
    );
    await createImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "register.csv"),
        fileHashSha256: "register-hash",
        originalFilename: "register.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    const gate = await getReviewGateStatus(firm.id, payRun.id);
    expect(gate.missingSources).toEqual(["BANK", "GL"]);
    expect(gate.unmappedSources).toEqual(["REGISTER"]);
  });

  it("submits pay runs once gates are met", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Submit Review",
        payrollSystem: "STAFFOLOGY",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-10-01T00:00:00Z"),
        periodEnd: new Date("2026-10-31T00:00:00Z")
      }
    );

    await createMappedImport({
      firmId: firm.id,
      userId: user.id,
      userRole: user.role,
      clientId: client.id,
      payRunId: payRun.id,
      sourceType: "REGISTER"
    });
    await createMappedImport({
      firmId: firm.id,
      userId: user.id,
      userRole: user.role,
      clientId: client.id,
      payRunId: payRun.id,
      sourceType: "BANK"
    });
    await createMappedImport({
      firmId: firm.id,
      userId: user.id,
      userRole: user.role,
      clientId: client.id,
      payRunId: payRun.id,
      sourceType: "GL"
    });

    await prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "RECONCILED" }
    });

    const updated = await submitPayRunForReview(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );
    expect(updated.status).toBe("READY_FOR_REVIEW");

    const event = await prisma.auditEvent.findFirst({
      where: { firmId: firm.id, action: "PAY_RUN_SUBMITTED_FOR_REVIEW" }
    });
    expect(event).not.toBeNull();
  });

  it("blocks submissions with critical exceptions", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Critical Block",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-11-01T00:00:00Z"),
        periodEnd: new Date("2026-11-30T00:00:00Z")
      }
    );

    await createMappedImport({
      firmId: firm.id,
      userId: user.id,
      userRole: user.role,
      clientId: client.id,
      payRunId: payRun.id,
      sourceType: "REGISTER"
    });
    await createMappedImport({
      firmId: firm.id,
      userId: user.id,
      userRole: user.role,
      clientId: client.id,
      payRunId: payRun.id,
      sourceType: "BANK"
    });
    await createMappedImport({
      firmId: firm.id,
      userId: user.id,
      userRole: user.role,
      clientId: client.id,
      payRunId: payRun.id,
      sourceType: "GL"
    });

    await prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "RECONCILED" }
    });

    await createCriticalException({
      firmId: firm.id,
      payRunId: payRun.id,
      userId: user.id
    });

    await expect(
      submitPayRunForReview(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects submissions when sources or mapping are missing", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Missing Gate",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2027-04-01T00:00:00Z"),
        periodEnd: new Date("2027-04-30T00:00:00Z")
      }
    );

    await prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "RECONCILED" }
    });

    await createImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "register.csv"),
        fileHashSha256: "register-only",
        originalFilename: "register.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await expect(
      submitPayRunForReview(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);

    await createImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "BANK",
        storageKey: buildStorageKey(firm.id, payRun.id, "BANK", "bank.csv"),
        fileHashSha256: "bank-only",
        originalFilename: "bank.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );
    await createImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "GL",
        storageKey: buildStorageKey(firm.id, payRun.id, "GL", "gl.csv"),
        fileHashSha256: "gl-only",
        originalFilename: "gl.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await expect(
      submitPayRunForReview(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires reconciled pay runs before submission", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Status Check",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2027-05-01T00:00:00Z"),
        periodEnd: new Date("2027-05-31T00:00:00Z")
      }
    );

    await expect(
      submitPayRunForReview(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("approves and rejects pay runs with audit events", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const reviewer = await prisma.user.create({
      data: {
        firmId: firm.id,
        email: "reviewer@firm.com",
        role: "REVIEWER",
        status: "ACTIVE"
      }
    });
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Approval Client",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-12-01T00:00:00Z"),
        periodEnd: new Date("2026-12-31T00:00:00Z")
      }
    );

    await prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "READY_FOR_REVIEW" }
    });

    const approval = await approvePayRun(
      { firmId: firm.id, userId: reviewer.id, role: reviewer.role },
      payRun.id,
      "Looks good."
    );
    expect(approval.status).toBe("APPROVED");

    const approvedRun = await prisma.payRun.findFirst({
      where: { id: payRun.id }
    });
    expect(approvedRun?.status).toBe("APPROVED");

    const approvedEvent = await prisma.auditEvent.findFirst({
      where: { firmId: firm.id, action: "PAY_RUN_APPROVED" }
    });
    expect(approvedEvent).not.toBeNull();

    const rejectedRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2027-01-01T00:00:00Z"),
        periodEnd: new Date("2027-01-31T00:00:00Z")
      }
    );
    await prisma.payRun.update({
      where: { id: rejectedRun.id },
      data: { status: "READY_FOR_REVIEW" }
    });

    const rejection = await rejectPayRun(
      { firmId: firm.id, userId: reviewer.id, role: reviewer.role },
      rejectedRun.id,
      "Needs updates."
    );
    expect(rejection.status).toBe("REJECTED");

    const payRunAfterReject = await prisma.payRun.findFirst({
      where: { id: rejectedRun.id }
    });
    expect(payRunAfterReject?.status).toBe("RECONCILED");

    const rejectedEvent = await prisma.auditEvent.findFirst({
      where: { firmId: firm.id, action: "PAY_RUN_REJECTED" }
    });
    expect(rejectedEvent).not.toBeNull();
  });

  it("enforces role and validation constraints", async () => {
    const { firm, user } = await createFirmWithUser("REVIEWER");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Role Check",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2027-02-01T00:00:00Z"),
        periodEnd: new Date("2027-02-28T00:00:00Z")
      }
    );
    await prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "RECONCILED" }
    });

    await expect(
      submitPayRunForReview(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      rejectPayRun(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id,
        " "
      )
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      approvePayRun(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns not found for approvals on unknown pay runs", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    await expect(
      approvePayRun(
        { firmId: firm.id, userId: user.id, role: user.role },
        "2ed1e8f2-3edb-47b4-9f3e-5e2a43a9d1d9"
      )
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      rejectPayRun(
        { firmId: firm.id, userId: user.id, role: user.role },
        "2ed1e8f2-3edb-47b4-9f3e-5e2a43a9d1d9",
        "Not found."
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns not found across firms", async () => {
    const { firm: firmA, user: userA } = await createFirmWithUser("ADMIN");
    const { firm: firmB, user: userB } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firmA.id, userId: userA.id },
      {
        name: "Firm Bound",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firmA.id, userId: userA.id, role: userA.role },
      {
        clientId: client.id,
        periodStart: new Date("2027-03-01T00:00:00Z"),
        periodEnd: new Date("2027-03-31T00:00:00Z")
      }
    );

    await expect(
      submitPayRunForReview(
        { firmId: firmB.id, userId: userB.id, role: userB.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("blocks rejection when pay run is not ready", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const reviewer = await prisma.user.create({
      data: {
        firmId: firm.id,
        email: "reviewer-two@firm.com",
        role: "REVIEWER",
        status: "ACTIVE"
      }
    });
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Reject Status",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2027-06-01T00:00:00Z"),
        periodEnd: new Date("2027-06-30T00:00:00Z")
      }
    );
    await prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "RECONCILED" }
    });

    await expect(
      rejectPayRun(
        { firmId: firm.id, userId: reviewer.id, role: reviewer.role },
        payRun.id,
        "Needs attention."
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
