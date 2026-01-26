import "server-only";

import { prisma, type SourceType } from "@/lib/prisma";
import { recordAuditEvent } from "./audit";
import { NotFoundError, ValidationError } from "./errors";
import { transitionPayRunStatus } from "./pay-runs";
import { resolveRequiredSources } from "./required-sources";

type ActorContext = {
  firmId: string;
  userId: string;
  role: "ADMIN" | "PREPARER" | "REVIEWER";
};

const assertRole = (role: ActorContext["role"], allowed: ActorContext["role"][]) => {
  if (!allowed.includes(role)) {
    throw new ValidationError("Permission denied.");
  }
};

const buildSourceLabels = () => ({
  REGISTER: "Register",
  BANK: "Bank / Payments",
  GL: "GL Journal",
  STATUTORY: "Statutory Totals",
  PENSION_SCHEDULE: "Pension Schedule"
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
  const firm = await prisma.firm.findFirst({
    where: { id: firmId },
    select: { defaults: true }
  });
  const requiredSources = resolveRequiredSources(firm?.defaults);

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

  const missingSources = requiredSources.filter(
    (source) => !latestBySource.has(source)
  );
  const unmappedSources = requiredSources.filter((source) => {
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
    },
    include: {
      firm: true
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
  input?: { comment?: string | null; noComment?: boolean }
) => {
  assertRole(context.role, ["ADMIN", "REVIEWER"]);

  const payRun = await prisma.payRun.findFirst({
    where: {
      id: payRunId,
      firmId: context.firmId
    },
    include: {
      firm: true
    }
  });

  if (!payRun) {
    throw new NotFoundError("Pay run not found.");
  }

  if (payRun.status !== "READY_FOR_REVIEW") {
    throw new ValidationError("Pay run is not ready for review.");
  }

  const comment = input?.comment?.trim() ?? "";
  const noComment = input?.noComment === true;

  if (comment.length === 0 && !noComment) {
    throw new ValidationError("Add a comment or confirm no comment.");
  }

  const approvalSettings =
    payRun.firm.defaults &&
    typeof payRun.firm.defaults === "object" &&
    "approvalSettings" in payRun.firm.defaults
      ? (payRun.firm.defaults as { approvalSettings?: { allowSelfApproval?: boolean } })
          .approvalSettings
      : null;

  if (!approvalSettings?.allowSelfApproval) {
    const lastSubmit = await prisma.auditEvent.findFirst({
      where: {
        firmId: context.firmId,
        entityType: "PAY_RUN",
        entityId: payRun.id,
        action: "PAY_RUN_SUBMITTED_FOR_REVIEW"
      },
      orderBy: { timestamp: "desc" }
    });
    if (lastSubmit?.actorUserId && lastSubmit.actorUserId === context.userId) {
      throw new ValidationError(
        "Reviewer approval must be performed by a different user."
      );
    }
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
        comment: comment || null
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
        approvalId: approval.id,
        commentLength: comment.length,
        noComment
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
    },
    include: {
      firm: true
    }
  });

  if (!payRun) {
    throw new NotFoundError("Pay run not found.");
  }

  if (payRun.status !== "READY_FOR_REVIEW") {
    throw new ValidationError("Pay run is not ready for review.");
  }

  const approvalSettings =
    payRun.firm?.defaults &&
    typeof payRun.firm.defaults === "object" &&
    "approvalSettings" in payRun.firm.defaults
      ? (payRun.firm.defaults as { approvalSettings?: { allowSelfApproval?: boolean } })
          .approvalSettings
      : null;

  if (!approvalSettings?.allowSelfApproval) {
    const lastSubmit = await prisma.auditEvent.findFirst({
      where: {
        firmId: context.firmId,
        entityType: "PAY_RUN",
        entityId: payRun.id,
        action: "PAY_RUN_SUBMITTED_FOR_REVIEW"
      },
      orderBy: { timestamp: "desc" }
    });
    if (lastSubmit?.actorUserId && lastSubmit.actorUserId === context.userId) {
      throw new ValidationError(
        "Reviewer approval must be performed by a different user."
      );
    }
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
        commentLength: comment.trim().length,
        noComment: false
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  return approval;
};
