import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma, type Pack } from "@/lib/prisma";
import { createClient } from "@/lib/clients";
import { createPayRun } from "@/lib/pay-runs";
import { buildStorageKey, createImport } from "@/lib/imports";
import { generatePack, getPackDownloadUrl, lockPack } from "@/lib/packs";
import { storageClient } from "@/lib/storage";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createFirmWithUser, resetDb } from "./test-db";

const seedApprovedPayRun = async () => {
  const { firm, user } = await createFirmWithUser("ADMIN");
  const reviewer = await prisma.user.create({
    data: {
      firmId: firm.id,
      email: "reviewer@firm.test",
      role: "REVIEWER",
      status: "ACTIVE"
    }
  });
  const client = await createClient(
    { firmId: firm.id, userId: user.id },
    {
      name: "Pack Client",
      payrollSystem: "BRIGHTPAY",
      payrollFrequency: "MONTHLY"
    }
  );
  const payRun = await createPayRun(
    { firmId: firm.id, userId: user.id, role: user.role },
    {
      clientId: client.id,
      periodStart: new Date("2027-07-01T00:00:00Z"),
      periodEnd: new Date("2027-07-31T00:00:00Z")
    }
  );

  const registerImport = await createImport(
    { firmId: firm.id, userId: user.id, role: user.role },
    {
      payRunId: payRun.id,
      sourceType: "REGISTER",
      storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "register.csv"),
      fileHashSha256: "hash-register",
      originalFilename: "register.csv",
      mimeType: "text/csv",
      sizeBytes: 120
    }
  );
  const bankImport = await createImport(
    { firmId: firm.id, userId: user.id, role: user.role },
    {
      payRunId: payRun.id,
      sourceType: "BANK",
      storageKey: buildStorageKey(firm.id, payRun.id, "BANK", "bank.csv"),
      fileHashSha256: "hash-bank",
      originalFilename: "bank.csv",
      mimeType: "text/csv",
      sizeBytes: 120
    }
  );
  const glImport = await createImport(
    { firmId: firm.id, userId: user.id, role: user.role },
    {
      payRunId: payRun.id,
      sourceType: "GL",
      storageKey: buildStorageKey(firm.id, payRun.id, "GL", "gl.csv"),
      fileHashSha256: "hash-gl",
      originalFilename: "gl.csv",
      mimeType: "text/csv",
      sizeBytes: 120
    }
  );

  const template = await prisma.mappingTemplate.create({
    data: {
      firmId: firm.id,
      clientId: client.id,
      sourceType: "REGISTER",
      name: "Register template",
      version: 1,
      status: "ACTIVE",
      sourceColumns: ["employee_id", "net_pay"],
      columnMap: { employeeId: "employee_id", netPay: "net_pay" },
      createdByUserId: user.id
    }
  });

  await prisma.import.update({
    where: { id: registerImport.importRecord.id },
    data: { mappingTemplateVersionId: template.id }
  });

  const run = await prisma.reconciliationRun.create({
    data: {
      firmId: firm.id,
      payRunId: payRun.id,
      runNumber: 1,
      bundleId: "BUNDLE_UK_V1",
      bundleVersion: "v1",
      status: "SUCCESS",
      inputSummary: {
        imports: {
          REGISTER: { importId: registerImport.importRecord.id },
          BANK: { importId: bankImport.importRecord.id },
          GL: { importId: glImport.importRecord.id }
        }
      },
      executedByUserId: user.id
    }
  });

  const checkResult = await prisma.checkResult.create({
    data: {
      reconciliationRunId: run.id,
      checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
      checkVersion: "v1",
      status: "PASS",
      severity: "INFO",
      summary: "All good",
      details: {
        leftLabel: "Register net total",
        rightLabel: "Bank total",
        leftValue: 1000,
        rightValue: 1000,
        deltaValue: 0,
        deltaPercent: 0,
        formula: "Register - Bank",
        toleranceApplied: { absolute: 1, percent: 0.1, applied: 1 }
      }
    }
  });

  await prisma.exception.create({
    data: {
      firmId: firm.id,
      payRunId: payRun.id,
      reconciliationRunId: run.id,
      checkResultId: checkResult.id,
      category: "BANK_MISMATCH",
      severity: "LOW",
      status: "OPEN",
      title: "Minor mismatch",
      description: "Small variance.",
      evidence: [
        {
          importId: registerImport.importRecord.id,
          rowNumbers: [1, 2],
          note: "Top rows"
        }
      ]
    }
  });

  await prisma.approval.create({
    data: {
      firmId: firm.id,
      payRunId: payRun.id,
      reviewerUserId: reviewer.id,
      status: "APPROVED",
      comment: "Approved."
    }
  });

  await prisma.payRun.update({
    where: { id: payRun.id },
    data: { status: "APPROVED" }
  });

  return { firm, user, reviewer, payRun };
};

describe("pack generation and locking", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates packs and updates pay run status", async () => {
    const { firm, user, payRun } = await seedApprovedPayRun();
    const sendSpy = vi
      .spyOn(storageClient as unknown as { send: () => Promise<unknown> }, "send")
      .mockResolvedValueOnce({});

    const pack = await generatePack(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    expect(pack.packVersion).toBe(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);

    const updatedPayRun = await prisma.payRun.findFirst({
      where: { id: payRun.id }
    });
    expect(updatedPayRun?.status).toBe("PACKED");

    const event = await prisma.auditEvent.findFirst({
      where: { firmId: firm.id, action: "PACK_GENERATED" }
    });
    expect(event).not.toBeNull();
  });

  it("stores redaction settings in pack metadata", async () => {
    const { firm, user, payRun } = await seedApprovedPayRun();
    await prisma.firm.update({
      where: { id: firm.id },
      data: {
        defaults: {
          redaction: {
            maskEmployeeNames: true,
            maskBankDetails: true,
            maskNiNumbers: false
          }
        }
      }
    });

    vi.spyOn(storageClient as unknown as { send: () => Promise<unknown> }, "send")
      .mockResolvedValueOnce({});

    const pack = await generatePack(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    const storedPack = await prisma.pack.findFirst({
      where: { id: pack.id }
    });

    expect(storedPack?.metadata).toMatchObject({
      redaction: {
        maskEmployeeNames: true,
        maskBankDetails: true,
        maskNiNumbers: false
      }
    });
  });

  it("records failures when pack uploads fail", async () => {
    const { firm, user, payRun } = await seedApprovedPayRun();
    vi.spyOn(storageClient as unknown as { send: () => Promise<unknown> }, "send")
      .mockRejectedValue(new Error("upload failed"));

    await expect(
      generatePack({ firmId: firm.id, userId: user.id, role: user.role }, payRun.id)
    ).rejects.toBeInstanceOf(Error);
  });

  it("blocks pack generation when prerequisites are missing", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Missing Pack",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2027-08-01T00:00:00Z"),
        periodEnd: new Date("2027-08-31T00:00:00Z")
      }
    );

    await expect(
      generatePack(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);

    await prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "APPROVED" }
    });

    await expect(
      generatePack(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("enforces firm scoping for pack generation", async () => {
    const { payRun } = await seedApprovedPayRun();
    const { firm: firmB, user: userB } = await createFirmWithUser("ADMIN");

    vi.spyOn(storageClient as unknown as { send: () => Promise<unknown> }, "send")
      .mockResolvedValueOnce({});

    await expect(
      generatePack(
        { firmId: firmB.id, userId: userB.id, role: userB.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("generates packs without optional data", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Minimal Pack",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2027-10-01T00:00:00Z"),
        periodEnd: new Date("2027-10-31T00:00:00Z")
      }
    );

    await prisma.reconciliationRun.create({
      data: {
        firmId: firm.id,
        payRunId: payRun.id,
        runNumber: 1,
        bundleId: "BUNDLE_UK_V1",
        bundleVersion: "v1",
        status: "SUCCESS",
        inputSummary: {},
        executedByUserId: user.id
      }
    });

    await prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "APPROVED" }
    });

    vi.spyOn(storageClient as unknown as { send: () => Promise<unknown> }, "send")
      .mockResolvedValueOnce({});

    const pack = await generatePack(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    expect(pack.packVersion).toBe(1);
  });

  it("increments pack versions when regenerated", async () => {
    const { firm, user, payRun } = await seedApprovedPayRun();
    const sendSpy = vi
      .spyOn(storageClient as unknown as { send: () => Promise<unknown> }, "send")
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const first = await generatePack(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    await prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "APPROVED" }
    });

    const second = await generatePack(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    expect(first.packVersion).toBe(1);
    expect(second.packVersion).toBe(2);
    expect(sendSpy).toHaveBeenCalledTimes(2);
  });

  it("locks packs and records audit events", async () => {
    const { firm, reviewer, payRun } = await seedApprovedPayRun();
    vi.spyOn(storageClient as unknown as { send: () => Promise<unknown> }, "send")
      .mockResolvedValueOnce({});

    await generatePack(
      { firmId: firm.id, userId: reviewer.id, role: reviewer.role },
      payRun.id
    );

    const locked = await lockPack(
      { firmId: firm.id, userId: reviewer.id, role: reviewer.role },
      payRun.id
    );

    expect(locked.lockedAt).not.toBeNull();

    const updatedPayRun = await prisma.payRun.findFirst({
      where: { id: payRun.id }
    });
    expect(updatedPayRun?.status).toBe("LOCKED");

    const event = await prisma.auditEvent.findFirst({
      where: { firmId: firm.id, action: "PACK_LOCKED" }
    });
    expect(event).not.toBeNull();
  });

  it("blocks lock attempts for preparers and missing packs", async () => {
    const { firm, user, payRun } = await seedApprovedPayRun();
    vi.spyOn(storageClient as unknown as { send: () => Promise<unknown> }, "send")
      .mockResolvedValueOnce({});

    await generatePack(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    const preparer = await prisma.user.create({
      data: {
        firmId: firm.id,
        email: "prep@firm.test",
        role: "PREPARER",
        status: "ACTIVE"
      }
    });

    await expect(
      lockPack(
        { firmId: firm.id, userId: preparer.id, role: preparer.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);

    const missingPayRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: payRun.clientId,
        periodStart: new Date("2027-09-01T00:00:00Z"),
        periodEnd: new Date("2027-09-30T00:00:00Z")
      }
    );
    await prisma.payRun.update({
      where: { id: missingPayRun.id },
      data: { status: "PACKED" }
    });

    await expect(
      lockPack(
        { firmId: firm.id, userId: user.id, role: user.role },
        missingPayRun.id
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("builds signed download URLs for packs", async () => {
    const { firm, user, payRun } = await seedApprovedPayRun();
    vi.spyOn(storageClient as unknown as { send: () => Promise<unknown> }, "send")
      .mockResolvedValueOnce({});

    const pack = await generatePack(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    const url = await getPackDownloadUrl(pack);
    expect(url).toContain("X-Amz-");
  });

  it("rejects invalid pack storage URIs", async () => {
    const pack = {
      id: "pack-1",
      firmId: "firm-1",
      payRunId: "payrun-1",
      reconciliationRunId: "run-1",
      packVersion: 1,
      storageUriPdf: "invalid://bucket/key",
      storageUriBundle: null,
      metadata: {},
      generatedAt: new Date(),
      generatedByUserId: "user-1",
      lockedAt: null,
      lockedByUserId: null
    };

    await expect(getPackDownloadUrl(pack as Pack))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it("blocks locking already locked packs", async () => {
    const { firm, reviewer, payRun } = await seedApprovedPayRun();
    vi.spyOn(storageClient as unknown as { send: () => Promise<unknown> }, "send")
      .mockResolvedValueOnce({});

    await generatePack(
      { firmId: firm.id, userId: reviewer.id, role: reviewer.role },
      payRun.id
    );

    await lockPack(
      { firmId: firm.id, userId: reviewer.id, role: reviewer.role },
      payRun.id
    );

    await expect(
      lockPack(
        { firmId: firm.id, userId: reviewer.id, role: reviewer.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("blocks locking when pack is already locked but pay run is packed", async () => {
    const { firm, reviewer, payRun } = await seedApprovedPayRun();
    vi.spyOn(storageClient as unknown as { send: () => Promise<unknown> }, "send")
      .mockResolvedValueOnce({});

    const pack = await generatePack(
      { firmId: firm.id, userId: reviewer.id, role: reviewer.role },
      payRun.id
    );

    await prisma.pack.update({
      where: { id: pack.id },
      data: {
        lockedAt: new Date(),
        lockedByUserId: reviewer.id
      }
    });

    await expect(
      lockPack(
        { firmId: firm.id, userId: reviewer.id, role: reviewer.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
