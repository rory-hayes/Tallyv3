import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { ExpectedVariance } from "@/lib/prisma";
import { prisma } from "@/lib/prisma";
import {
  applyExpectedVariances,
  archiveExpectedVariance,
  createExpectedVariance
} from "@/lib/expected-variances";
import type { CheckEvaluation } from "@/lib/reconciliation-checks";
import { createClient } from "@/lib/clients";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createFirmWithUser, resetDb } from "./test-db";

describe("expected variances", () => {
  const baseEvaluation: CheckEvaluation = {
    checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
    checkVersion: "v1",
    status: "FAIL",
    severity: "CRITICAL",
    summary: "Mismatch detected.",
    details: {
      leftLabel: "Register net total",
      rightLabel: "Bank total",
      leftValue: 100,
      rightValue: 95,
      deltaValue: 5,
      deltaPercent: 5,
      formula: "Register - Bank",
      toleranceApplied: {
        absolute: 1,
        percent: 0.05,
        applied: 1
      }
    },
    evidence: [],
    exception: {
      category: "BANK_MISMATCH",
      title: "Mismatch",
      description: "Totals differ."
    }
  };

  it("downgrades failing checks when variance matches", () => {
    const variance = {
      id: "variance-1",
      firmId: "firm-1",
      clientId: "client-1",
      checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
      varianceType: "ROUNDING",
      condition: { amountBounds: { max: 5 } },
      effect: { downgradeTo: "WARN" },
      active: true,
      createdByUserId: "user-1",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as ExpectedVariance;

    const result = applyExpectedVariances({
      evaluation: baseEvaluation,
      expectedVariances: [variance]
    });

    expect(result.status).toBe("WARN");
    expect(result.exception).toBeNull();
    expect(result.details.expectedVariance?.id).toBe("variance-1");
  });

  it("keeps failures when variance does not match", () => {
    const variance = {
      id: "variance-2",
      firmId: "firm-1",
      clientId: "client-1",
      checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
      varianceType: "ROUNDING",
      condition: { amountBounds: { max: 2 } },
      effect: { downgradeTo: "WARN" },
      active: true,
      createdByUserId: "user-1",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as ExpectedVariance;

    const result = applyExpectedVariances({
      evaluation: baseEvaluation,
      expectedVariances: [variance]
    });

    expect(result.status).toBe("FAIL");
    expect(result.exception).not.toBeNull();
  });

  it("returns early when the check already passed", () => {
    const evaluation: CheckEvaluation = {
      ...baseEvaluation,
      status: "PASS",
      severity: "INFO"
    };
    const result = applyExpectedVariances({
      evaluation,
      expectedVariances: []
    });

    expect(result).toBe(evaluation);
  });

  it("matches payee and reference conditions when provided", () => {
    const variance = {
      id: "variance-3",
      firmId: "firm-1",
      clientId: "client-1",
      checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
      varianceType: "ROUNDING",
      condition: { payeeContains: "batch", referenceContains: "march" },
      effect: { downgradeTo: "PASS", requiresNote: true },
      active: true,
      createdByUserId: "user-1",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as ExpectedVariance;

    const result = applyExpectedVariances({
      evaluation: baseEvaluation,
      expectedVariances: [variance],
      bankPayments: [
        { payeeKey: "batch-1", reference: "March payroll" },
        { payeeKey: "other", reference: "" }
      ]
    });

    expect(result.status).toBe("PASS");
    expect(result.severity).toBe("INFO");
    expect(result.details.expectedVariance?.requiresNote).toBe(true);
  });

  it("ignores variances with invalid effects", () => {
    const variance = {
      id: "variance-4",
      firmId: "firm-1",
      clientId: "client-1",
      checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
      varianceType: "ROUNDING",
      condition: { amountBounds: { max: 10 } },
      effect: { downgradeTo: "FAIL" },
      active: true,
      createdByUserId: "user-1",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as ExpectedVariance;

    const result = applyExpectedVariances({
      evaluation: baseEvaluation,
      expectedVariances: [variance]
    });

    expect(result.status).toBe("FAIL");
  });

  it("treats non-object conditions as unconstrained", () => {
    const variance = {
      id: "variance-4b",
      firmId: "firm-1",
      clientId: "client-1",
      checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
      varianceType: "ROUNDING",
      condition: "not-an-object",
      effect: { downgradeTo: "WARN" },
      active: true,
      createdByUserId: "user-1",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as ExpectedVariance;

    const result = applyExpectedVariances({
      evaluation: baseEvaluation,
      expectedVariances: [variance]
    });

    expect(result.status).toBe("WARN");
    expect(result.details.expectedVariance?.id).toBe("variance-4b");
  });

  it("skips variances with non-object effects", () => {
    const variance = {
      id: "variance-4c",
      firmId: "firm-1",
      clientId: "client-1",
      checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
      varianceType: "ROUNDING",
      condition: { amountBounds: { max: 10 } },
      effect: "not-an-object",
      active: true,
      createdByUserId: "user-1",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as ExpectedVariance;

    const result = applyExpectedVariances({
      evaluation: baseEvaluation,
      expectedVariances: [variance]
    });

    expect(result.status).toBe("FAIL");
  });

  it("respects percent bounds when evaluating variances", () => {
    const variance = {
      id: "variance-5",
      firmId: "firm-1",
      clientId: "client-1",
      checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
      varianceType: "ROUNDING",
      condition: { pctBounds: { max: 2 } },
      effect: { downgradeTo: "WARN" },
      active: true,
      createdByUserId: "user-1",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as ExpectedVariance;

    const result = applyExpectedVariances({
      evaluation: baseEvaluation,
      expectedVariances: [variance]
    });

    expect(result.status).toBe("FAIL");
  });

  it("skips inactive or mismatched variances", () => {
    const variances = [
      {
        id: "variance-6",
        firmId: "firm-1",
        clientId: "client-1",
        checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
        varianceType: "ROUNDING",
        condition: { amountBounds: { max: 10 } },
        effect: { downgradeTo: "WARN" },
        active: false,
        createdByUserId: "user-1",
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "variance-7",
        firmId: "firm-1",
        clientId: "client-1",
        checkType: "CHK_REGISTER_NET_TO_GL_TOTAL",
        varianceType: "ROUNDING",
        condition: { amountBounds: { max: 10 } },
        effect: { downgradeTo: "WARN" },
        active: true,
        createdByUserId: "user-1",
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ] as ExpectedVariance[];

    const result = applyExpectedVariances({
      evaluation: baseEvaluation,
      expectedVariances: variances
    });

    expect(result.status).toBe("FAIL");
  });

  it("skips variances when delta values are not numeric", () => {
    const evaluation = {
      ...baseEvaluation,
      details: {
        ...baseEvaluation.details,
        deltaValue: "n/a",
        deltaPercent: undefined
      }
    } as unknown as CheckEvaluation;

    const variance = {
      id: "variance-8",
      firmId: "firm-1",
      clientId: "client-1",
      checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
      varianceType: "ROUNDING",
      condition: { amountBounds: { min: 1 }, pctBounds: { max: 10 } },
      effect: { downgradeTo: "WARN" },
      active: true,
      createdByUserId: "user-1",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as ExpectedVariance;

    const result = applyExpectedVariances({
      evaluation,
      expectedVariances: [variance]
    });

    expect(result.status).toBe("FAIL");
  });

  it("skips when text conditions do not match", () => {
    const variance = {
      id: "variance-9",
      firmId: "firm-1",
      clientId: "client-1",
      checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
      varianceType: "ROUNDING",
      condition: { payeeContains: "batch", referenceContains: "march" },
      effect: { downgradeTo: "WARN" },
      active: true,
      createdByUserId: "user-1",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as ExpectedVariance;

    const result = applyExpectedVariances({
      evaluation: baseEvaluation,
      expectedVariances: [variance],
      bankPayments: [{ payeeKey: "vendor", reference: "April payroll" }]
    });

    expect(result.status).toBe("FAIL");
  });

  it("skips when amount bounds minimum is not met", () => {
    const variance = {
      id: "variance-10",
      firmId: "firm-1",
      clientId: "client-1",
      checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
      varianceType: "ROUNDING",
      condition: { amountBounds: { min: 10 } },
      effect: { downgradeTo: "WARN" },
      active: true,
      createdByUserId: "user-1",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as ExpectedVariance;

    const result = applyExpectedVariances({
      evaluation: baseEvaluation,
      expectedVariances: [variance]
    });

    expect(result.status).toBe("FAIL");
  });
});

describe("expected variance management", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("creates variances and records audits", async () => {
    const { firm, user } = await createFirmWithUser("REVIEWER");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Variance Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );

    const variance = await createExpectedVariance(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
        varianceType: "ROUNDING",
        condition: { amountBounds: { max: 5 } },
        effect: { downgradeTo: "WARN", requiresReviewerAck: true }
      }
    );

    expect(variance.clientId).toBe(client.id);

    const audit = await prisma.auditEvent.findFirst({
      where: { firmId: firm.id, action: "EXPECTED_VARIANCE_CREATED" }
    });
    expect(audit?.entityId).toBe(client.id);
  });

  it("prevents preparers from creating variances", async () => {
    const { firm, user } = await createFirmWithUser("PREPARER");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Variance Client 2",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );

    await expect(
      createExpectedVariance(
        { firmId: firm.id, userId: user.id, role: user.role },
        {
          clientId: client.id,
          checkType: null,
          varianceType: "ROUNDING",
          condition: { amountBounds: { max: 5 } },
          effect: { downgradeTo: "WARN" }
        }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects missing clients when creating variances", async () => {
    const { firm, user } = await createFirmWithUser("REVIEWER");
    const missingClientId = randomUUID();

    await expect(
      createExpectedVariance(
        { firmId: firm.id, userId: user.id, role: user.role },
        {
          clientId: missingClientId,
          checkType: null,
          varianceType: "ROUNDING",
          condition: { amountBounds: { max: 5 } },
          effect: { downgradeTo: "WARN" }
        }
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("archives variances and records audits", async () => {
    const { firm, user } = await createFirmWithUser("REVIEWER");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Variance Client 3",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );

    const variance = await prisma.expectedVariance.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
        varianceType: "ROUNDING",
        condition: { amountBounds: { max: 5 } },
        effect: { downgradeTo: "WARN" },
        active: true,
        createdByUserId: user.id
      }
    });

    const archived = await archiveExpectedVariance(
      { firmId: firm.id, userId: user.id, role: user.role },
      variance.id
    );

    expect(archived.active).toBe(false);
    expect(archived.archivedAt).not.toBeNull();

    const audit = await prisma.auditEvent.findFirst({
      where: { firmId: firm.id, action: "EXPECTED_VARIANCE_ARCHIVED" }
    });
    expect(audit?.entityId).toBe(client.id);
  });

  it("prevents preparers from archiving variances", async () => {
    const { firm, user } = await createFirmWithUser("PREPARER");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Variance Client 4",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );

    const variance = await prisma.expectedVariance.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
        varianceType: "ROUNDING",
        condition: { amountBounds: { max: 5 } },
        effect: { downgradeTo: "WARN" },
        active: true,
        createdByUserId: user.id
      }
    });

    await expect(
      archiveExpectedVariance(
        { firmId: firm.id, userId: user.id, role: user.role },
        variance.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires existing variances to archive", async () => {
    const { firm, user } = await createFirmWithUser("REVIEWER");
    const missingVarianceId = randomUUID();

    await expect(
      archiveExpectedVariance(
        { firmId: firm.id, userId: user.id, role: user.role },
        missingVarianceId
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
