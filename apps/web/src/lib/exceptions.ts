import "server-only";

import { prisma } from "@tally/db";
import { recordAuditEvent } from "./audit";
import { NotFoundError, ValidationError } from "./errors";

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

const ensureException = async (firmId: string, exceptionId: string) => {
  const exception = await prisma.exception.findFirst({
    where: {
      id: exceptionId,
      firmId
    },
    include: {
      payRun: true
    }
  });

  if (!exception) {
    throw new NotFoundError("Exception not found.");
  }

  if (exception.supersededAt) {
    throw new ValidationError("This exception has been superseded.");
  }

  if (exception.payRun.status === "LOCKED" || exception.payRun.status === "ARCHIVED") {
    throw new ValidationError("Locked pay runs cannot update exceptions.");
  }

  return exception;
};

const ensureAssignee = async (firmId: string, userId: string | null) => {
  if (!userId) {
    return;
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, firmId }
  });

  if (!user) {
    throw new ValidationError("Assignee must belong to this firm.");
  }
};

export const assignException = async (
  context: ActorContext,
  exceptionId: string,
  assignedToUserId: string | null
) => {
  assertRole(context.role, ["ADMIN", "PREPARER", "REVIEWER"]);
  const exception = await ensureException(context.firmId, exceptionId);
  await ensureAssignee(context.firmId, assignedToUserId);

  const updated = await prisma.exception.update({
    where: { id: exception.id },
    data: {
      assignedToUserId
    }
  });

  await recordAuditEvent(
    {
      action: "EXCEPTION_ASSIGNED",
      entityType: "EXCEPTION",
      entityId: updated.id,
      metadata: {
        payRunId: updated.payRunId,
        assignedToUserId: assignedToUserId ?? undefined
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  return updated;
};

export const resolveException = async (
  context: ActorContext,
  exceptionId: string,
  note: string
) => {
  assertRole(context.role, ["ADMIN", "PREPARER", "REVIEWER"]);
  const exception = await ensureException(context.firmId, exceptionId);

  if (exception.status === "RESOLVED") {
    throw new ValidationError("Exception is already resolved.");
  }

  if (note.trim().length < 2) {
    throw new ValidationError("Resolution note is required.");
  }

  const updated = await prisma.exception.update({
    where: { id: exception.id },
    data: {
      status: "RESOLVED",
      resolutionNote: note.trim(),
      resolvedByUserId: context.userId,
      resolvedAt: new Date()
    }
  });

  await recordAuditEvent(
    {
      action: "EXCEPTION_RESOLVED",
      entityType: "EXCEPTION",
      entityId: updated.id,
      metadata: {
        payRunId: updated.payRunId
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  return updated;
};

export const dismissException = async (
  context: ActorContext,
  exceptionId: string,
  note: string
) => {
  assertRole(context.role, ["ADMIN", "PREPARER", "REVIEWER"]);
  const exception = await ensureException(context.firmId, exceptionId);

  if (exception.status === "DISMISSED") {
    throw new ValidationError("Exception is already dismissed.");
  }

  if (note.trim().length < 2) {
    throw new ValidationError("Dismissal note is required.");
  }

  const updated = await prisma.exception.update({
    where: { id: exception.id },
    data: {
      status: "DISMISSED",
      resolutionNote: note.trim(),
      resolvedByUserId: context.userId,
      resolvedAt: new Date()
    }
  });

  await recordAuditEvent(
    {
      action: "EXCEPTION_DISMISSED",
      entityType: "EXCEPTION",
      entityId: updated.id,
      metadata: {
        payRunId: updated.payRunId
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  return updated;
};

export const overrideException = async (
  context: ActorContext,
  exceptionId: string,
  note: string
) => {
  assertRole(context.role, ["ADMIN", "REVIEWER"]);
  const exception = await ensureException(context.firmId, exceptionId);

  if (exception.status === "OVERRIDDEN") {
    throw new ValidationError("Exception is already overridden.");
  }

  if (note.trim().length < 2) {
    throw new ValidationError("Override note is required.");
  }

  const updated = await prisma.exception.update({
    where: { id: exception.id },
    data: {
      status: "OVERRIDDEN",
      resolutionNote: note.trim(),
      resolvedByUserId: context.userId,
      resolvedAt: new Date()
    }
  });

  await recordAuditEvent(
    {
      action: "EXCEPTION_OVERRIDDEN",
      entityType: "EXCEPTION",
      entityId: updated.id,
      metadata: {
        payRunId: updated.payRunId
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  return updated;
};
