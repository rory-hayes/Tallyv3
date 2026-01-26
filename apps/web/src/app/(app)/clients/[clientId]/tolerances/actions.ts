"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { parseToleranceForm } from "@/lib/tolerance-form";

const ensureReviewer = (role: string) => {
  if (role === "PREPARER") {
    throw new ValidationError("Reviewer approval is required to change tolerances.");
  }
};

const stripTolerances = (
  settings: unknown
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue => {
  if (!settings || typeof settings !== "object") {
    return Prisma.JsonNull;
  }
  const rest = { ...(settings as Record<string, unknown>) };
  delete rest.tolerances;
  return Object.keys(rest).length > 0
    ? (rest as Prisma.InputJsonObject)
    : Prisma.JsonNull;
};

export const updateClientTolerancesAction = async (formData: FormData) => {
  const { session, user } = await requireUser();
  ensureReviewer(user.role);

  const clientId = String(formData.get("clientId") || "");
  if (!clientId) {
    throw new ValidationError("Client is required.");
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, firmId: session.firmId }
  });
  if (!client) {
    throw new NotFoundError("Client not found.");
  }

  const tolerances = parseToleranceForm(formData);
  const settings =
    client.settings && typeof client.settings === "object"
      ? (client.settings as Record<string, unknown>)
      : {};

  await prisma.client.update({
    where: { id: client.id },
    data: {
      settings: {
        ...settings,
        tolerances
      }
    }
  });

  await recordAuditEvent(
    {
      action: "TOLERANCE_UPDATED",
      entityType: "CLIENT",
      entityId: client.id,
      metadata: {
        scope: "CLIENT"
      }
    },
    {
      firmId: session.firmId,
      actorUserId: user.id
    }
  );

  revalidatePath(`/clients/${client.id}/tolerances`);
};

export const resetClientTolerancesAction = async (formData: FormData) => {
  const { session, user } = await requireUser();
  ensureReviewer(user.role);

  const clientId = String(formData.get("clientId") || "");
  if (!clientId) {
    throw new ValidationError("Client is required.");
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, firmId: session.firmId }
  });
  if (!client) {
    throw new NotFoundError("Client not found.");
  }

  await prisma.client.update({
    where: { id: client.id },
    data: {
      settings: stripTolerances(client.settings)
    }
  });

  await recordAuditEvent(
    {
      action: "TOLERANCE_UPDATED",
      entityType: "CLIENT",
      entityId: client.id,
      metadata: {
        scope: "CLIENT",
        reset: true
      }
    },
    {
      firmId: session.firmId,
      actorUserId: user.id
    }
  );

  revalidatePath(`/clients/${client.id}/tolerances`);
};
