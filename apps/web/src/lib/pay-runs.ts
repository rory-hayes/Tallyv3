import "server-only";

import { prisma, type PayRunStatus } from "@/lib/prisma";
import { recordAuditEvent } from "./audit";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { assertPayRunTransition, type ActorRole } from "./pay-run-state";
import { formatPeriodLabel } from "./pay-run-utils";

export type PayRunInput = {
  clientId: string;
  periodStart: Date;
  periodEnd: Date;
};

type ActorContext = {
  firmId: string;
  userId?: string | null;
  role: ActorRole;
};

const ensureClientActive = async (firmId: string, clientId: string) => {
  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      firmId,
      archivedAt: null
    }
  });

  if (!client) {
    throw new NotFoundError("Client not found.");
  }
};

export const createPayRun = async (
  context: ActorContext,
  input: PayRunInput
) => {
  if (input.periodStart > input.periodEnd) {
    throw new ValidationError("Period start must be before period end.");
  }

  await ensureClientActive(context.firmId, input.clientId);

  const periodLabel = formatPeriodLabel(input.periodStart, input.periodEnd);

  try {
    const payRun = await prisma.payRun.create({
      data: {
        firmId: context.firmId,
        clientId: input.clientId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        periodLabel
      }
    });

    await recordAuditEvent(
      {
        action: "PAY_RUN_CREATED",
        entityType: "PAY_RUN",
        entityId: payRun.id,
        metadata: {
          clientId: payRun.clientId,
          revision: payRun.revision
        }
      },
      {
        firmId: context.firmId,
        actorUserId: context.userId ?? null
      }
    );

    return payRun;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new ConflictError("A pay run already exists for that period.");
    }
    throw error;
  }
};

export const transitionPayRunStatus = async (
  context: ActorContext,
  payRunId: string,
  nextStatus: PayRunStatus
) => {
  const payRun = await prisma.payRun.findFirst({
    where: {
      id: payRunId,
      firmId: context.firmId
    }
  });

  if (!payRun) {
    throw new NotFoundError("Pay run not found.");
  }

  assertPayRunTransition(payRun.status, nextStatus, context.role);

  const updated = await prisma.payRun.update({
    where: { id: payRun.id },
    data: { status: nextStatus }
  });

  await recordAuditEvent(
    {
      action: "PAY_RUN_STATE_CHANGED",
      entityType: "PAY_RUN",
      entityId: updated.id,
      metadata: {
        from: payRun.status,
        to: updated.status
      }
    },
      {
        firmId: context.firmId,
        actorUserId: context.userId ?? null
      }
    );

  return updated;
};

export const createPayRunRevision = async (
  context: ActorContext,
  payRunId: string
) => {
  const payRun = await prisma.payRun.findFirst({
    where: {
      id: payRunId,
      firmId: context.firmId
    }
  });

  if (!payRun) {
    throw new NotFoundError("Pay run not found.");
  }

  const latest = await prisma.payRun.findFirst({
    where: {
      clientId: payRun.clientId,
      periodStart: payRun.periodStart,
      periodEnd: payRun.periodEnd
    },
    orderBy: { revision: "desc" }
  });

  if (!latest || latest.id !== payRun.id) {
    throw new ValidationError("Only the latest revision can be revised.");
  }

  if (payRun.status !== "LOCKED") {
    throw new ValidationError("Only locked pay runs can be revised.");
  }

  const newPayRun = await prisma.payRun.create({
    data: {
      firmId: context.firmId,
      clientId: payRun.clientId,
      periodStart: payRun.periodStart,
      periodEnd: payRun.periodEnd,
      periodLabel: payRun.periodLabel,
      revision: payRun.revision + 1,
      status: "DRAFT"
    }
  });

  await recordAuditEvent(
    {
      action: "PAY_RUN_REVISION_CREATED",
      entityType: "PAY_RUN",
      entityId: newPayRun.id,
      metadata: {
        previousPayRunId: payRun.id,
        revision: newPayRun.revision
      }
    },
      {
        firmId: context.firmId,
        actorUserId: context.userId ?? null
      }
    );

  return newPayRun;
};
