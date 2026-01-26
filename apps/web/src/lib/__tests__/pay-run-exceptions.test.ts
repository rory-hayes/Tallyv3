import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/clients";
import { createPayRun } from "@/lib/pay-runs";
import { derivePayRunStatus, getOpenExceptionCounts } from "@/lib/pay-run-exceptions";
import { createFirmWithUser, resetDb } from "./test-db";

const seedOpenException = async () => {
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
      periodStart: new Date("2026-12-01T00:00:00Z"),
      periodEnd: new Date("2026-12-31T00:00:00Z")
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
      status: "OPEN",
      title: "Register total mismatch",
      description: "Totals are out of balance."
    }
  });

  return { firm, payRun, exception };
};

describe("pay run exceptions helpers", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns empty counts when no pay runs are provided", async () => {
    const { firm } = await createFirmWithUser("ADMIN");
    const counts = await getOpenExceptionCounts(firm.id, []);
    expect(counts.size).toBe(0);
  });

  it("counts open exceptions and derives display status", async () => {
    const { firm, payRun } = await seedOpenException();
    const counts = await getOpenExceptionCounts(firm.id, [payRun.id]);
    expect(counts.get(payRun.id)).toBe(1);
    expect(derivePayRunStatus("RECONCILED", 1)).toBe("EXCEPTIONS_OPEN");
    expect(derivePayRunStatus("MAPPED", 1)).toBe("MAPPED");
  });
});
