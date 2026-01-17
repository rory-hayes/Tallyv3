"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@tally/db";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

const parseCheckbox = (formData: FormData, key: string): boolean =>
  formData.get(key) === "on";

export const updateRedactionSettingsAction = async (formData: FormData) => {
  const { session, user } = await requireUser();
  requirePermission(user.role, "firm:manage");

  const firm = await prisma.firm.findFirst({
    where: { id: session.firmId }
  });

  if (!firm) {
    return;
  }

  const defaults =
    firm.defaults && typeof firm.defaults === "object"
      ? (firm.defaults as Record<string, unknown>)
      : {};

  const redaction = {
    maskEmployeeNames: parseCheckbox(formData, "maskEmployeeNames"),
    maskBankDetails: parseCheckbox(formData, "maskBankDetails"),
    maskNiNumbers: parseCheckbox(formData, "maskNiNumbers")
  };

  await prisma.firm.update({
    where: { id: firm.id },
    data: {
      defaults: {
        ...defaults,
        redaction
      }
    }
  });

  revalidatePath("/settings/redaction");
};
