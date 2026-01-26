"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  type CheckType,
  type ExpectedVarianceType
} from "@/lib/prisma";
import { ValidationError, NotFoundError } from "@/lib/errors";
import {
  createExpectedVariance,
  archiveExpectedVariance
} from "@/lib/expected-variances";

export type ExpectedVarianceFormState = {
  error?: string;
};

const checkTypeOptions: CheckType[] = [
  "CHK_REGISTER_NET_TO_BANK_TOTAL",
  "CHK_JOURNAL_DEBITS_EQUAL_CREDITS",
  "CHK_REGISTER_DEDUCTIONS_TO_STATUTORY_TOTALS",
  "CHK_REGISTER_GROSS_TO_JOURNAL_EXPENSE",
  "CHK_REGISTER_EMPLOYER_COSTS_TO_JOURNAL_EXPENSE",
  "CHK_REGISTER_NET_PAY_TO_JOURNAL_LIABILITY",
  "CHK_REGISTER_TAX_TO_JOURNAL_LIABILITY",
  "CHK_REGISTER_PENSION_TO_JOURNAL_LIABILITY",
  "CHK_REGISTER_PENSION_TO_PENSION_SCHEDULE",
  "CHK_BANK_DUPLICATE_PAYMENTS",
  "CHK_BANK_NEGATIVE_PAYMENTS",
  "CHK_BANK_PAYMENT_COUNT_MISMATCH"
];

const varianceTypeOptions: ExpectedVarianceType[] = [
  "DIRECTORS_SEPARATE",
  "PENSION_SEPARATE",
  "ROUNDING",
  "OTHER"
];

const parseOptionalNumber = (value: FormDataEntryValue | null): number | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError("Variance bounds must be valid numbers.");
  }
  return parsed;
};

const parseOptionalText = (value: FormDataEntryValue | null): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseCheckbox = (formData: FormData, key: string) =>
  formData.get(key) === "on";

export const createExpectedVarianceAction = async (
  _prevState: ExpectedVarianceFormState,
  formData: FormData
): Promise<ExpectedVarianceFormState> => {
  try {
    const { session, user } = await requireUser();
    const clientId = String(formData.get("clientId") || "");
    const varianceType = String(formData.get("varianceType") || "");
    const checkTypeInput = String(formData.get("checkType") || "");
    const downgradeTo = String(formData.get("downgradeTo") || "");

    if (!clientId) {
      return { error: "Client is required." };
    }
    if (!varianceTypeOptions.includes(varianceType as ExpectedVarianceType)) {
      return { error: "Select a valid variance type." };
    }
    if (downgradeTo !== "PASS" && downgradeTo !== "WARN") {
      return { error: "Select a valid downgrade status." };
    }

    const checkType = checkTypeOptions.includes(checkTypeInput as CheckType)
      ? (checkTypeInput as CheckType)
      : null;

    const amountMin = parseOptionalNumber(formData.get("amountMin"));
    const amountMax = parseOptionalNumber(formData.get("amountMax"));
    const pctMin = parseOptionalNumber(formData.get("percentMin"));
    const pctMax = parseOptionalNumber(formData.get("percentMax"));
    const payeeContains = parseOptionalText(formData.get("payeeContains"));
    const referenceContains = parseOptionalText(formData.get("referenceContains"));

    const condition: {
      amountBounds?: { min?: number; max?: number };
      pctBounds?: { min?: number; max?: number };
      payeeContains?: string;
      referenceContains?: string;
    } = {};

    if (amountMin !== undefined || amountMax !== undefined) {
      condition.amountBounds = {
        ...(amountMin !== undefined ? { min: amountMin } : {}),
        ...(amountMax !== undefined ? { max: amountMax } : {})
      };
    }
    if (pctMin !== undefined || pctMax !== undefined) {
      condition.pctBounds = {
        ...(pctMin !== undefined ? { min: pctMin } : {}),
        ...(pctMax !== undefined ? { max: pctMax } : {})
      };
    }
    if (payeeContains) {
      condition.payeeContains = payeeContains;
    }
    if (referenceContains) {
      condition.referenceContains = referenceContains;
    }
    if (
      !condition.amountBounds &&
      !condition.pctBounds &&
      !condition.payeeContains &&
      !condition.referenceContains
    ) {
      return { error: "Add at least one matching condition." };
    }

    await createExpectedVariance(
      {
        firmId: session.firmId,
        userId: session.userId,
        role: user.role
      },
      {
        clientId,
        checkType,
        varianceType: varianceType as ExpectedVarianceType,
        condition,
        effect: {
          downgradeTo: downgradeTo as "PASS" | "WARN",
          requiresNote: parseCheckbox(formData, "requiresNote"),
          requiresAttachment: parseCheckbox(formData, "requiresAttachment"),
          requiresReviewerAck: parseCheckbox(formData, "requiresReviewerAck")
        }
      }
    );

    revalidatePath(`/clients/${clientId}/expected-variances`);
    return {};
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      return { error: error.message };
    }
    throw error;
  }
};

export const archiveExpectedVarianceAction = async (formData: FormData) => {
  const { session, user } = await requireUser();
  const varianceId = String(formData.get("varianceId") || "");
  if (!varianceId) {
    throw new ValidationError("Variance is required.");
  }

  const variance = await archiveExpectedVariance(
    {
      firmId: session.firmId,
      userId: session.userId,
      role: user.role
    },
    varianceId
  );

  revalidatePath(`/clients/${variance.clientId}/expected-variances`);
};
