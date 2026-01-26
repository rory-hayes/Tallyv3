"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import {
  NotFoundError,
  ValidationError
} from "@/lib/errors";
import {
  deleteAccountClassification,
  upsertAccountClassification
} from "@/lib/account-classifications";

export type AccountClassificationFormState = {
  error?: string;
};

const classificationSchema = z.object({
  clientId: z.string().uuid(),
  accountCode: z.string().min(1),
  accountName: z.string().optional(),
  classification: z.enum([
    "EXPENSE",
    "NET_PAYABLE",
    "TAX_PAYABLE",
    "NI_PRSI_PAYABLE",
    "PENSION_PAYABLE",
    "CASH",
    "OTHER"
  ])
});

const handleError = (error: unknown): AccountClassificationFormState => {
  if (error instanceof PermissionError) {
    return { error: "Permission denied." };
  }
  if (error instanceof ValidationError) {
    return { error: error.message };
  }
  if (error instanceof NotFoundError) {
    return { error: error.message };
  }
  throw error;
};

export const upsertAccountClassificationAction = async (
  _prevState: AccountClassificationFormState,
  formData: FormData
): Promise<AccountClassificationFormState> => {
  const { session, user } = await requireUser();
  const parsed = classificationSchema.safeParse({
    clientId: formData.get("clientId"),
    accountCode: formData.get("accountCode"),
    accountName: formData.get("accountName"),
    classification: formData.get("classification")
  });
  if (!parsed.success) {
    return { error: "Provide a valid account classification." };
  }

  try {
    await upsertAccountClassification(
      { firmId: session.firmId, userId: session.userId, role: user.role },
      parsed.data.clientId,
      {
        accountCode: parsed.data.accountCode,
        accountName: parsed.data.accountName,
        classification: parsed.data.classification
      }
    );
    revalidatePath(`/clients/${parsed.data.clientId}/account-classifications`);
    return {};
  } catch (error) {
    return handleError(error);
  }
};

export const deleteAccountClassificationAction = async (formData: FormData) => {
  const { session, user } = await requireUser();
  const id = String(formData.get("classificationId") || "");
  const clientId = String(formData.get("clientId") || "");
  if (!id || !clientId) {
    return;
  }
  await deleteAccountClassification(
    { firmId: session.firmId, userId: session.userId, role: user.role },
    id
  );
  revalidatePath(`/clients/${clientId}/account-classifications`);
};
