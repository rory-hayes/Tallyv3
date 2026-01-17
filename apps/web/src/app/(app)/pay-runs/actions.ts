"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createPayRun } from "@/lib/pay-runs";
import { parseDateInput } from "@/lib/pay-run-utils";
import { requireUser } from "@/lib/auth";
import { PermissionError, requirePermission } from "@/lib/permissions";
import {
  ConflictError,
  NotFoundError,
  ValidationError
} from "@/lib/errors";

export type PayRunFormState = {
  error?: string;
};

const payRunSchema = z.object({
  clientId: z.string().uuid(),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1)
});

const handlePayRunError = (error: unknown): PayRunFormState => {
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

export const createPayRunAction = async (
  _prevState: PayRunFormState,
  formData: FormData
): Promise<PayRunFormState> => {
  const { session, user } = await requireUser();
  try {
    requirePermission(user.role, "pay-run:create");
  } catch (error) {
    return handlePayRunError(error);
  }

  const parsed = payRunSchema.safeParse({
    clientId: formData.get("clientId"),
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd")
  });

  if (!parsed.success) {
    return { error: "Provide a valid client and period." };
  }

  try {
    const payRun = await createPayRun(
      {
        firmId: session.firmId,
        userId: session.userId,
        role: user.role
      },
      {
        clientId: parsed.data.clientId,
        periodStart: parseDateInput(parsed.data.periodStart),
        periodEnd: parseDateInput(parsed.data.periodEnd)
      }
    );
    redirect(`/pay-runs/${payRun.id}`);
  } catch (error) {
    return handlePayRunError(error);
  }
};
