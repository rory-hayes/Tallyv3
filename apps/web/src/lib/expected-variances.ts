import "server-only";

import {
  prisma,
  type CheckSeverity,
  type CheckStatus,
  type CheckType,
  type ExpectedVariance,
  type ExpectedVarianceType
} from "@/lib/prisma";
import { recordAuditEvent } from "./audit";
import { ValidationError, NotFoundError } from "./errors";
import type { CheckEvaluation } from "./reconciliation-checks";

type ActorContext = {
  firmId: string;
  userId: string;
  role: "ADMIN" | "PREPARER" | "REVIEWER";
};

type VarianceCondition = {
  amountBounds?: { min?: number; max?: number };
  pctBounds?: { min?: number; max?: number };
  payeeContains?: string;
  referenceContains?: string;
};

type VarianceEffect = {
  downgradeTo: CheckStatus;
  requiresNote?: boolean;
  requiresAttachment?: boolean;
  requiresReviewerAck?: boolean;
};

type BankPaymentContext = {
  payeeKey: string;
  reference: string;
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const parseCondition = (value: unknown): VarianceCondition | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const amountBounds = raw.amountBounds && typeof raw.amountBounds === "object"
    ? (raw.amountBounds as { min?: unknown; max?: unknown })
    : undefined;
  const pctBounds = raw.pctBounds && typeof raw.pctBounds === "object"
    ? (raw.pctBounds as { min?: unknown; max?: unknown })
    : undefined;

  return {
    amountBounds: amountBounds
      ? {
          min:
            typeof amountBounds.min === "number" ? amountBounds.min : undefined,
          max:
            typeof amountBounds.max === "number" ? amountBounds.max : undefined
        }
      : undefined,
    pctBounds: pctBounds
      ? {
          min: typeof pctBounds.min === "number" ? pctBounds.min : undefined,
          max: typeof pctBounds.max === "number" ? pctBounds.max : undefined
        }
      : undefined,
    payeeContains:
      typeof raw.payeeContains === "string" ? raw.payeeContains : undefined,
    referenceContains:
      typeof raw.referenceContains === "string" ? raw.referenceContains : undefined
  };
};

const parseEffect = (value: unknown): VarianceEffect | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const downgradeTo = raw.downgradeTo;
  if (downgradeTo !== "PASS" && downgradeTo !== "WARN") {
    return null;
  }
  return {
    downgradeTo,
    requiresNote: raw.requiresNote === true,
    requiresAttachment: raw.requiresAttachment === true,
    requiresReviewerAck: raw.requiresReviewerAck === true
  };
};

const matchesBounds = (
  value: number | null,
  bounds?: { min?: number; max?: number }
) => {
  if (!bounds) {
    return true;
  }
  if (value === null) {
    return false;
  }
  if (typeof bounds.min === "number" && value < bounds.min) {
    return false;
  }
  if (typeof bounds.max === "number" && value > bounds.max) {
    return false;
  }
  return true;
};

const matchesTextCondition = (
  contextValues: string[],
  required?: string
) => {
  if (!required) {
    return true;
  }
  const needle = normalizeText(required);
  return contextValues.some((value) => normalizeText(value).includes(needle));
};

const applySeverityForStatus = (status: CheckStatus): CheckSeverity => {
  if (status === "PASS") {
    return "INFO";
  }
  if (status === "WARN") {
    return "LOW";
  }
  /* c8 ignore next */
  return "HIGH";
};

export const applyExpectedVariances = ({
  evaluation,
  expectedVariances,
  bankPayments
}: {
  evaluation: CheckEvaluation;
  expectedVariances: ExpectedVariance[];
  bankPayments?: BankPaymentContext[];
}): CheckEvaluation => {
  if (evaluation.status !== "FAIL") {
    return evaluation;
  }

  const deltaValue =
    typeof evaluation.details?.deltaValue === "number"
      ? Math.abs(evaluation.details.deltaValue)
      : null;
  const deltaPercent =
    typeof evaluation.details?.deltaPercent === "number"
      ? Math.abs(evaluation.details.deltaPercent)
      : null;

  const payeeValues = bankPayments?.map((entry) => entry.payeeKey) ?? [];
  const referenceValues = bankPayments?.map((entry) => entry.reference) ?? [];

  for (const variance of expectedVariances) {
    if (!variance.active) {
      continue;
    }
    if (variance.checkType && variance.checkType !== evaluation.checkType) {
      continue;
    }

    const condition = parseCondition(variance.condition);
    const effect = parseEffect(variance.effect);
    if (!effect) {
      continue;
    }

    if (!matchesBounds(deltaValue, condition?.amountBounds)) {
      continue;
    }
    if (!matchesBounds(deltaPercent, condition?.pctBounds)) {
      continue;
    }
    if (
      !matchesTextCondition(payeeValues, condition?.payeeContains) ||
      !matchesTextCondition(referenceValues, condition?.referenceContains)
    ) {
      continue;
    }

    const status = effect.downgradeTo;
    const severity = applySeverityForStatus(status);

    return {
      ...evaluation,
      status,
      severity,
      summary: `${evaluation.summary} Expected variance applied.`,
      details: {
        ...evaluation.details,
        expectedVariance: {
          id: variance.id,
          varianceType: variance.varianceType,
          downgradeTo: status,
          requiresNote: effect.requiresNote,
          requiresAttachment: effect.requiresAttachment,
          requiresReviewerAck: effect.requiresReviewerAck
        }
      },
      exception: null
    };
  }

  return evaluation;
};

export const createExpectedVariance = async (
  context: ActorContext,
  input: {
    clientId: string;
    checkType?: CheckType | null;
    varianceType: ExpectedVarianceType;
    condition: VarianceCondition;
    effect: VarianceEffect;
  }
) => {
  if (context.role === "PREPARER") {
    throw new ValidationError("Only reviewers can create expected variances.");
  }

  const client = await prisma.client.findFirst({
    where: {
      id: input.clientId,
      firmId: context.firmId
    }
  });
  if (!client) {
    throw new NotFoundError("Client not found.");
  }

  const variance = await prisma.expectedVariance.create({
    data: {
      firmId: context.firmId,
      clientId: client.id,
      checkType: input.checkType ?? null,
      varianceType: input.varianceType,
      condition: input.condition,
      effect: input.effect,
      active: true,
      createdByUserId: context.userId
    }
  });

  await recordAuditEvent(
    {
      action: "EXPECTED_VARIANCE_CREATED",
      entityType: "CLIENT",
      entityId: client.id,
      metadata: {
        varianceId: variance.id,
        checkType: variance.checkType ?? "ALL",
        varianceType: variance.varianceType
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  return variance;
};

export const archiveExpectedVariance = async (
  context: ActorContext,
  varianceId: string
) => {
  if (context.role === "PREPARER") {
    throw new ValidationError("Only reviewers can archive expected variances.");
  }

  const variance = await prisma.expectedVariance.findFirst({
    where: {
      id: varianceId,
      firmId: context.firmId
    }
  });
  if (!variance) {
    throw new NotFoundError("Expected variance not found.");
  }

  const archived = await prisma.expectedVariance.update({
    where: { id: variance.id },
    data: {
      active: false,
      archivedAt: new Date()
    }
  });

  await recordAuditEvent(
    {
      action: "EXPECTED_VARIANCE_ARCHIVED",
      entityType: "CLIENT",
      entityId: variance.clientId,
      metadata: {
        varianceId: variance.id,
        checkType: variance.checkType ?? "ALL",
        varianceType: variance.varianceType
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  return archived;
};
