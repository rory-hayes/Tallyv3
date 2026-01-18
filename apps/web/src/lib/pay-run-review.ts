import "server-only";

import { prisma, type SourceType } from "@/lib/prisma";
import { recordAuditEvent } from "./audit";
import { NotFoundError, ValidationError } from "./errors";
import { transitionPayRunStatus } from "./pay-runs";

type ActorContext = {
  firmId: string;
  userId: string;
  role: "ADMIN" | "PREPARER" | "REVIEWER";
};

const REQUIRED_SOURCES: SourceType[] = ["REGISTER", "BANK", "GL"];

const assertRole = (role: ActorContext["role"], allowed: ActorContext["role"][]) => {
  if (!allowed.includes(role)) {
    throw new ValidationError("Permission denied.");
  }
};

const buildSourceLabels = () => ({
  REGISTER: "Register",
  BANK: "Bank / Payments",
  GL: "GL Journal",
  STATUTORY: "Statutory Totals"
});

export type ReviewGateResult = {
  missingSources: SourceType[];
  unmappedSources: SourceType[];
  openCriticalCount: number;
  openExceptionCount: number;
};

export const getReviewGateStatus = async (
  firmId: string,
  payRunId: string
): Promise<ReviewGateResult> => {
  const imports = await prisma.import.findMany({
    where: {
      firmId,
      payRunId
    },
    orderBy: [{ sourceType: "asc" }, { version: "desc" }]
  });

  const latestBySource = new Map<SourceType, (typeof imports)[number]>();
  for (const entry of imports) {
    if (!latestBySource.has(entry.sourceType)) {
      latestBySource.set(entry.sourceType, entry);
    }
  }

  const missingSources = REQUIRED_SOURCES.filter(
    (source) => !latestBySource.has(source)
  );
  const unmappedSources = REQUIRED_SOURCES.filter((source) => {
    const latest = latestBySource.get(source);
    return latest ? !latest.mappingTemplateVersionId : false;
  });

  const [openCriticalCount, openExceptionCount] = await Promise.all([
    prisma.exception.count({
      where: {
        firmId,
        payRunId,
        supersededAt: null,
        status: "OPEN",
        severity: "CRITICAL"
      }
    }),
    prisma.exception.count({
      where: {
        firmId,
        payRunId,
        supersededAt: null,
        status: "OPEN"
      }
    })
  ]);

  return {
    missingSources,
    unmappedSources,
    openCriticalCount,
    openExceptionCount
  };
};

export const submitPayRunForReview = async (
  context: ActorContext,
  payRunId: string
) => {
  assertRole(context.role, ["ADMIN", "PREPARER"]);

  const payRun = await prisma.payRun.findFirst({
    where: {
      id: payRunId,
      firmId: context.firmId
    }
  });

  if (!payRun) {
    throw new NotFoundError("Pay run not found.");
  }

  if (payRun.status !== "RECONCILED") {
    throw new ValidationError("Pay run must be reconciled before review.");
  }

  const gate = await getReviewGateStatus(context.firmId, payRunId);
  const labels = buildSourceLabels();

  if (gate.missingSources.length > 0) {
    throw new ValidationError(
      `Missing required sources: ${gate.missingSources
        .map((source) => labels[source])
        .join(", ")}.`
    );
  }

  if (gate.unmappedSources.length > 0) {
    throw new ValidationError(
      `Mapping required for: ${gate.unmappedSources
        .map((source) => labels[source])
        .join(", ")}.`
    );
  }

  if (gate.openCriticalCount > 0) {
    throw new ValidationError(
      "Resolve or override critical exceptions before review."
    );
  }

  const updated = await transitionPayRunStatus(
    {
      firmId: context.firmId,
      userId: context.userId,
      role: context.role
    },
    payRun.id,
    "READY_FOR_REVIEW"
  );

  await recordAuditEvent(
    {
      action: "PAY_RUN_SUBMITTED_FOR_REVIEW",
      entityType: "PAY_RUN",
      entityId: updated.id,
      metadata: {
        revision: updated.revision
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  return updated;
};

export const approvePayRun = async (
  context: ActorContext,
  payRunId: string,
  comment?: string | null
) => {
  assertRole(context.role, ["ADMIN", "REVIEWER"]);

  const payRun = await prisma.payRun.findFirst({
    where: {
      id: payRunId,
      firmId: context.firmId
    }
  });

  if (!payRun) {
    throw new NotFoundError("Pay run not found.");
  }

  if (payRun.status !== "READY_FOR_REVIEW") {
    throw new ValidationError("Pay run is not ready for review.");
  }

  const approval = await prisma.$transaction(async (tx) => {
    const updated = await transitionPayRunStatus(
      {
        firmId: context.firmId,
        userId: context.userId,
        role: context.role
      },
      payRun.id,
      "APPROVED"
    );

    const record = await tx.approval.create({
      data: {
        firmId: context.firmId,
        payRunId: updated.id,
        reviewerUserId: context.userId,
        status: "APPROVED",
        comment: comment?.trim() || null
      }
    });

    return record;
  });

  await recordAuditEvent(
    {
      action: "PAY_RUN_APPROVED",
      entityType: "PAY_RUN",
      entityId: payRun.id,
      metadata: {
        approvalId: approval.id
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  return approval;
};

export const rejectPayRun = async (
  context: ActorContext,
  payRunId: string,
  comment: string
) => {
  assertRole(context.role, ["ADMIN", "REVIEWER"]);

  if (comment.trim().length < 2) {
    throw new ValidationError("Rejection comment is required.");
  }

  const payRun = await prisma.payRun.findFirst({
    where: {
      id: payRunId,
      firmId: context.firmId
    }
  });

  if (!payRun) {
    throw new NotFoundError("Pay run not found.");
  }

  if (payRun.status !== "READY_FOR_REVIEW") {
    throw new ValidationError("Pay run is not ready for review.");
  }

  const approval = await prisma.$transaction(async (tx) => {
    const updated = await transitionPayRunStatus(
      {
        firmId: context.firmId,
        userId: context.userId,
        role: context.role
      },
      payRun.id,
      "RECONCILED"
    );

    const record = await tx.approval.create({
      data: {
        firmId: context.firmId,
        payRunId: updated.id,
        reviewerUserId: context.userId,
        status: "REJECTED",
        comment: comment.trim()
      }
    });

    return record;
  });

  await recordAuditEvent(
    {
      action: "PAY_RUN_REJECTED",
      entityType: "PAY_RUN",
      entityId: payRun.id,
      metadata: {
        approvalId: approval.id,
        commentLength: comment.trim().length
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  return approval;
};
