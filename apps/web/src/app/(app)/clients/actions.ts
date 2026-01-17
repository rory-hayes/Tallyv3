"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, updateClient, archiveClient } from "@/lib/clients";
import { requireUser } from "@/lib/auth";
import { PermissionError, requirePermission } from "@/lib/permissions";
import {
  ConflictError,
  NotFoundError,
  ValidationError
} from "@/lib/errors";

export type ClientFormState = {
  error?: string;
};

const clientSchema = z.object({
  clientId: z.string().uuid().optional(),
  name: z.string().min(2),
  payrollSystem: z.enum(["BRIGHTPAY", "STAFFOLOGY", "OTHER"]),
  payrollSystemOther: z.string().optional(),
  payrollFrequency: z.enum(["WEEKLY", "FORTNIGHTLY", "MONTHLY", "OTHER"]),
  defaultReviewerUserId: z.string().uuid().optional()
});

const buildClientInput = (formData: FormData) => {
  const defaultReviewerUserId = formData.get("defaultReviewerUserId");
  const payrollSystemOther = formData.get("payrollSystemOther");
  return clientSchema.safeParse({
    clientId: formData.get("clientId") || undefined,
    name: formData.get("name"),
    payrollSystem: formData.get("payrollSystem"),
    payrollSystemOther: payrollSystemOther ? String(payrollSystemOther) : undefined,
    payrollFrequency: formData.get("payrollFrequency"),
    defaultReviewerUserId: defaultReviewerUserId ? String(defaultReviewerUserId) : undefined
  });
};

const handleClientError = (error: unknown): ClientFormState => {
  if (error instanceof PermissionError) {
    return { error: "Permission denied." };
  }
  if (error instanceof ValidationError) {
    return { error: error.message };
  }
  if (error instanceof ConflictError) {
    return { error: error.message };
  }
  if (error instanceof NotFoundError) {
    return { error: error.message };
  }
  throw error;
};

export const createClientAction = async (
  _prevState: ClientFormState,
  formData: FormData
): Promise<ClientFormState> => {
  const { session, user } = await requireUser();
  try {
    requirePermission(user.role, "client:write");
  } catch (error) {
    return handleClientError(error);
  }

  const parsed = buildClientInput(formData);
  if (!parsed.success) {
    return { error: "Provide a client name and valid settings." };
  }

  try {
    const client = await createClient(
      { firmId: session.firmId, userId: session.userId },
      {
        name: parsed.data.name,
        payrollSystem: parsed.data.payrollSystem,
        payrollSystemOther: parsed.data.payrollSystemOther,
        payrollFrequency: parsed.data.payrollFrequency,
        defaultReviewerUserId: parsed.data.defaultReviewerUserId
      }
    );
    redirect(`/clients/${client.id}`);
  } catch (error) {
    return handleClientError(error);
  }
};

export const updateClientAction = async (
  _prevState: ClientFormState,
  formData: FormData
): Promise<ClientFormState> => {
  const { session, user } = await requireUser();
  try {
    requirePermission(user.role, "client:write");
  } catch (error) {
    return handleClientError(error);
  }

  const parsed = buildClientInput(formData);
  if (!parsed.success || !parsed.data.clientId) {
    return { error: "Provide a valid client update." };
  }

  try {
    const updated = await updateClient(
      { firmId: session.firmId, userId: session.userId },
      parsed.data.clientId,
      {
        name: parsed.data.name,
        payrollSystem: parsed.data.payrollSystem,
        payrollSystemOther: parsed.data.payrollSystemOther,
        payrollFrequency: parsed.data.payrollFrequency,
        defaultReviewerUserId: parsed.data.defaultReviewerUserId
      }
    );
    redirect(`/clients/${updated.id}`);
  } catch (error) {
    return handleClientError(error);
  }
};

export const archiveClientAction = async (formData: FormData) => {
  const { session, user } = await requireUser();
  requirePermission(user.role, "client:write");
  const clientId = String(formData.get("clientId") || "");
  const returnTo = String(formData.get("returnTo") || "/clients");
  if (!clientId) {
    return;
  }

  await archiveClient({ firmId: session.firmId, userId: session.userId }, clientId);
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  redirect(returnTo);
};
