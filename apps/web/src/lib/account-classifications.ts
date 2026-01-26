import "server-only";

import { prisma, type AccountClass } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "./errors";
import { requirePermission } from "./permissions";

type ActorContext = {
  firmId: string;
  userId: string;
  role: "ADMIN" | "PREPARER" | "REVIEWER";
};

type AccountClassificationInput = {
  accountCode: string;
  accountName?: string | null;
  classification: AccountClass;
};

export const listAccountClassifications = async (
  firmId: string,
  clientId: string
) =>
  prisma.accountClassification.findMany({
    where: { firmId, clientId },
    orderBy: [{ accountCode: "asc" }]
  });

export const upsertAccountClassification = async (
  context: ActorContext,
  clientId: string,
  input: AccountClassificationInput
) => {
  requirePermission(context.role, "client:write");

  const client = await prisma.client.findFirst({
    where: { id: clientId, firmId: context.firmId }
  });
  if (!client) {
    throw new NotFoundError("Client not found.");
  }

  const accountCode = input.accountCode.trim();
  if (accountCode.length === 0) {
    throw new ValidationError("Account code is required.");
  }

  return prisma.accountClassification.upsert({
    where: {
      clientId_accountCode: {
        clientId,
        accountCode
      }
    },
    update: {
      accountName: input.accountName?.trim() || null,
      classification: input.classification
    },
    create: {
      firmId: context.firmId,
      clientId,
      accountCode,
      accountName: input.accountName?.trim() || null,
      classification: input.classification
    }
  });
};

export const deleteAccountClassification = async (
  context: ActorContext,
  id: string
) => {
  requirePermission(context.role, "client:write");

  const entry = await prisma.accountClassification.findFirst({
    where: {
      id,
      firmId: context.firmId
    }
  });
  if (!entry) {
    throw new NotFoundError("Account classification not found.");
  }

  await prisma.accountClassification.delete({
    where: { id: entry.id }
  });
};
