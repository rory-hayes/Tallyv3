import "server-only";

import { prisma, type PayrollFrequency, type PayrollSystem } from "@tally/db";
import { recordAuditEvent } from "./audit";
import { ConflictError, NotFoundError, ValidationError } from "./errors";

export type ClientInput = {
  name: string;
  payrollSystem: PayrollSystem;
  payrollSystemOther?: string | null;
  payrollFrequency: PayrollFrequency;
  defaultReviewerUserId?: string | null;
};

type ActorContext = {
  firmId: string;
  userId: string;
};

const normalizeClientInput = (input: ClientInput): ClientInput => {
  if (input.payrollSystem === "OTHER" && !input.payrollSystemOther) {
    throw new ValidationError("Provide the payroll system name.");
  }

  if (input.payrollSystem !== "OTHER") {
    return { ...input, payrollSystemOther: null };
  }

  return input;
};

const assertDefaultReviewer = async (
  firmId: string,
  userId: string | null | undefined
) => {
  if (!userId) {
    return;
  }

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      firmId
    }
  });

  if (!user) {
    throw new ValidationError("Default reviewer must belong to this firm.");
  }
};

export const createClient = async (
  context: ActorContext,
  input: ClientInput
) => {
  const normalized = normalizeClientInput(input);
  await assertDefaultReviewer(context.firmId, normalized.defaultReviewerUserId);

  try {
    const client = await prisma.client.create({
      data: {
        firmId: context.firmId,
        name: normalized.name,
        payrollSystem: normalized.payrollSystem,
        payrollSystemOther: normalized.payrollSystemOther ?? null,
        payrollFrequency: normalized.payrollFrequency,
        defaultReviewerUserId: normalized.defaultReviewerUserId ?? null
      }
    });

    await recordAuditEvent(
      {
        action: "CLIENT_CREATED",
        entityType: "CLIENT",
        entityId: client.id,
        metadata: {
          payrollSystem: client.payrollSystem,
          payrollFrequency: client.payrollFrequency,
          defaultReviewerUserId: client.defaultReviewerUserId ?? undefined
        }
      },
      {
        firmId: context.firmId,
        actorUserId: context.userId
      }
    );

    return client;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new ConflictError("A client with these details already exists.");
    }
    throw error;
  }
};

export const updateClient = async (
  context: ActorContext,
  clientId: string,
  input: ClientInput
) => {
  const normalized = normalizeClientInput(input);
  await assertDefaultReviewer(context.firmId, normalized.defaultReviewerUserId);

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      firmId: context.firmId
    }
  });

  if (!client) {
    throw new NotFoundError("Client not found.");
  }

  const updated = await prisma.client.update({
    where: { id: client.id },
    data: {
      name: normalized.name,
      payrollSystem: normalized.payrollSystem,
      payrollSystemOther: normalized.payrollSystemOther ?? null,
      payrollFrequency: normalized.payrollFrequency,
      defaultReviewerUserId: normalized.defaultReviewerUserId ?? null
    }
  });

  await recordAuditEvent(
    {
      action: "CLIENT_UPDATED",
      entityType: "CLIENT",
      entityId: updated.id,
      metadata: {
        archived: updated.archivedAt ? true : false
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  return updated;
};

export const archiveClient = async (context: ActorContext, clientId: string) => {
  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      firmId: context.firmId
    }
  });

  if (!client) {
    throw new NotFoundError("Client not found.");
  }

  if (client.archivedAt) {
    return client;
  }

  const archived = await prisma.client.update({
    where: { id: client.id },
    data: { archivedAt: new Date() }
  });

  await recordAuditEvent(
    {
      action: "CLIENT_UPDATED",
      entityType: "CLIENT",
      entityId: archived.id,
      metadata: {
        archived: true
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  return archived;
};
