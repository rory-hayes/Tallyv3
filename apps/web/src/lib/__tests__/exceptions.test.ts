import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@tally/db";
import { createClient } from "@/lib/clients";
import { createPayRun } from "@/lib/pay-runs";
import {
  assignException,
  dismissException,
  overrideException,
  resolveException
} from "@/lib/exceptions";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createFirmWithUser, resetDb } from "./test-db";

const seedException = async ({
  status = "OPEN"
}: {
  status?: "OPEN" | "RESOLVED" | "DISMISSED" | "OVERRIDDEN";
} = {}) => {
  const { firm, user } = await createFirmWithUser("ADMIN");
  const client = await createClient(
    { firmId: firm.id, userId: user.id },
    {
      name: "Exception Client",
      payrollSystem: "BRIGHTPAY",
      payrollFrequency: "MONTHLY"
    }
  );
  const payRun = await createPayRun(
    { firmId: firm.id, userId: user.id, role: user.role },
    {
      clientId: client.id,
      periodStart: new Date("2026-08-01T00:00:00Z"),
      periodEnd: new Date("2026-08-31T00:00:00Z")
    }
  );
  const run = await prisma.reconciliationRun.create({
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
  const checkResult = await prisma.checkResult.create({
    data: {
      reconciliationRunId: run.id,
      checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
      checkVersion: "v1",
      status: "FAIL",
      severity: "HIGH",
      summary: "Mismatch",
      details: {
        leftLabel: "Register net total",
        rightLabel: "Bank total",
        leftValue: 1200,
        rightValue: 1000,
        deltaValue: 200,
        deltaPercent: 16.67,
        formula: "Register - Bank",
        toleranceApplied: { absolute: 1, percent: 0.1, applied: 1 }
      }
    }
  });
  const exception = await prisma.exception.create({
    data: {
      firmId: firm.id,
      payRunId: payRun.id,
      reconciliationRunId: run.id,
      checkResultId: checkResult.id,
      category: "BANK_MISMATCH",
      severity: "HIGH",
      status,
      title: "Register total mismatch",
      description: "Totals are out of balance."
    }
  });

  return { firm, user, payRun, exception };
};

describe("exception workflow", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("assigns exceptions and records audit events", async () => {
    const { firm, user, exception } = await seedException();
    const assignee = await prisma.user.create({
      data: {
        firmId: firm.id,
        email: "assignee@example.com",
        role: "PREPARER",
        status: "ACTIVE"
      }
    });

    await assignException(
      { firmId: firm.id, userId: user.id, role: user.role },
      exception.id,
      assignee.id
    );

    const updated = await prisma.exception.findFirst({
      where: { id: exception.id }
    });
    expect(updated?.assignedToUserId).toBe(assignee.id);

    const event = await prisma.auditEvent.findFirst({
      where: { firmId: firm.id, action: "EXCEPTION_ASSIGNED" }
    });
    expect(event).not.toBeNull();

    await assignException(
      { firmId: firm.id, userId: user.id, role: user.role },
      exception.id,
      null
    );

    const unassigned = await prisma.exception.findFirst({
      where: { id: exception.id }
    });
    expect(unassigned?.assignedToUserId).toBeNull();
  });

  it("blocks assignment to another firm", async () => {
    const { firm, user, exception } = await seedException();
    const { user: otherUser } = await createFirmWithUser("ADMIN");

    await expect(
      assignException(
        { firmId: firm.id, userId: user.id, role: user.role },
        exception.id,
        otherUser.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns not found for missing exceptions", async () => {
    const { firm, user } = await seedException();
    await expect(
      assignException(
        { firmId: firm.id, userId: user.id, role: user.role },
        "2ed1e8f2-3edb-47b4-9f3e-5e2a43a9d1d9",
        null
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("prevents updates for superseded exceptions", async () => {
    const { firm, user, exception } = await seedException();
    await prisma.exception.update({
      where: { id: exception.id },
      data: { supersededAt: new Date() }
    });

    await expect(
      assignException(
        { firmId: firm.id, userId: user.id, role: user.role },
        exception.id,
        null
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("resolves exceptions with notes and records audit events", async () => {
    const { firm, user, exception } = await seedException();

    await expect(
      resolveException(
        { firmId: firm.id, userId: user.id, role: user.role },
        exception.id,
        " "
      )
    ).rejects.toBeInstanceOf(ValidationError);

    await resolveException(
      { firmId: firm.id, userId: user.id, role: user.role },
      exception.id,
      "Reviewed and accepted."
    );

    const updated = await prisma.exception.findFirst({
      where: { id: exception.id }
    });
    expect(updated?.status).toBe("RESOLVED");
    expect(updated?.resolutionNote).toBe("Reviewed and accepted.");

    const event = await prisma.auditEvent.findFirst({
      where: { firmId: firm.id, action: "EXCEPTION_RESOLVED" }
    });
    expect(event).not.toBeNull();

    await expect(
      resolveException(
        { firmId: firm.id, userId: user.id, role: user.role },
        exception.id,
        "Second pass."
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("dismisses and overrides with role enforcement", async () => {
    const { firm, user, exception } = await seedException();
    const preparer = await prisma.user.create({
      data: {
        firmId: firm.id,
        email: "prep@example.com",
        role: "PREPARER",
        status: "ACTIVE"
      }
    });
    const reviewer = await prisma.user.create({
      data: {
        firmId: firm.id,
        email: "reviewer@example.com",
        role: "REVIEWER",
        status: "ACTIVE"
      }
    });

    await expect(
      dismissException(
        { firmId: firm.id, userId: user.id, role: user.role },
        exception.id,
        " "
      )
    ).rejects.toBeInstanceOf(ValidationError);

    await dismissException(
      { firmId: firm.id, userId: user.id, role: user.role },
      exception.id,
      "False positive."
    );

    const dismissed = await prisma.exception.findFirst({
      where: { id: exception.id }
    });
    expect(dismissed?.status).toBe("DISMISSED");

    await expect(
      dismissException(
        { firmId: firm.id, userId: user.id, role: user.role },
        exception.id,
        "False positive again."
      )
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      overrideException(
        { firmId: firm.id, userId: preparer.id, role: preparer.role },
        exception.id,
        "Override note."
      )
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      overrideException(
        { firmId: firm.id, userId: reviewer.id, role: reviewer.role },
        exception.id,
        " "
      )
    ).rejects.toBeInstanceOf(ValidationError);

    await overrideException(
      { firmId: firm.id, userId: reviewer.id, role: reviewer.role },
      exception.id,
      "Override note."
    );

    const overridden = await prisma.exception.findFirst({
      where: { id: exception.id }
    });
    expect(overridden?.status).toBe("OVERRIDDEN");

    const event = await prisma.auditEvent.findFirst({
      where: { firmId: firm.id, action: "EXCEPTION_OVERRIDDEN" }
    });
    expect(event).not.toBeNull();

    await expect(
      overrideException(
        { firmId: firm.id, userId: reviewer.id, role: reviewer.role },
        exception.id,
        "Override again."
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("blocks updates on locked pay runs", async () => {
    const { firm, user, payRun, exception } = await seedException();
    await prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "LOCKED" }
    });

    await expect(
      resolveException(
        { firmId: firm.id, userId: user.id, role: user.role },
        exception.id,
        "Note"
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
