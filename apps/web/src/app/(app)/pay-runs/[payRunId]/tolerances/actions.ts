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

const ensureEditable = (status: string) => {
  if (status === "LOCKED" || status === "ARCHIVED") {
    throw new ValidationError("Locked pay runs cannot be updated.");
  }
};

export const updatePayRunTolerancesAction = async (formData: FormData) => {
  const { session, user } = await requireUser();
  ensureReviewer(user.role);

  const payRunId = String(formData.get("payRunId") || "");
  if (!payRunId) {
    throw new ValidationError("Pay run is required.");
  }

  const payRun = await prisma.payRun.findFirst({
    where: { id: payRunId, firmId: session.firmId }
  });
  if (!payRun) {
    throw new NotFoundError("Pay run not found.");
  }
  ensureEditable(payRun.status);

  const tolerances = parseToleranceForm(formData);
  const settings =
    payRun.settings && typeof payRun.settings === "object"
      ? (payRun.settings as Record<string, unknown>)
      : {};

  await prisma.payRun.update({
    where: { id: payRun.id },
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
      entityType: "PAY_RUN",
      entityId: payRun.id,
      metadata: {
        scope: "PAY_RUN"
      }
    },
    {
      firmId: session.firmId,
      actorUserId: user.id
    }
  );

  revalidatePath(`/pay-runs/${payRun.id}/tolerances`);
};

export const resetPayRunTolerancesAction = async (formData: FormData) => {
  const { session, user } = await requireUser();
  ensureReviewer(user.role);

  const payRunId = String(formData.get("payRunId") || "");
  if (!payRunId) {
    throw new ValidationError("Pay run is required.");
  }

  const payRun = await prisma.payRun.findFirst({
    where: { id: payRunId, firmId: session.firmId }
  });
  if (!payRun) {
    throw new NotFoundError("Pay run not found.");
  }
  ensureEditable(payRun.status);

  await prisma.payRun.update({
    where: { id: payRun.id },
    data: {
      settings: stripTolerances(payRun.settings)
    }
  });

  await recordAuditEvent(
    {
      action: "TOLERANCE_UPDATED",
      entityType: "PAY_RUN",
      entityId: payRun.id,
      metadata: {
        scope: "PAY_RUN",
        reset: true
      }
    },
    {
      firmId: session.firmId,
      actorUserId: user.id
    }
  );

  revalidatePath(`/pay-runs/${payRun.id}/tolerances`);
};
