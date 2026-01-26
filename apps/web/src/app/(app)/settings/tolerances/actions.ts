"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit";
import { parseToleranceForm } from "@/lib/tolerance-form";

export const updateFirmTolerancesAction = async (formData: FormData) => {
  const { session, user } = await requireUser();
  requirePermission(user.role, "firm:manage");

  const firm = await prisma.firm.findFirst({
    where: { id: session.firmId }
  });
  if (!firm) {
    return;
  }

  const tolerances = parseToleranceForm(formData);
  const defaults =
    firm.defaults && typeof firm.defaults === "object"
      ? (firm.defaults as Record<string, unknown>)
      : {};

  await prisma.firm.update({
    where: { id: firm.id },
    data: {
      defaults: {
        ...defaults,
        tolerances
      }
    }
  });

  await recordAuditEvent(
    {
      action: "TOLERANCE_UPDATED",
      entityType: "FIRM",
      entityId: firm.id,
      metadata: {
        scope: "FIRM"
      }
    },
    {
      firmId: firm.id,
      actorUserId: user.id
    }
  );

  revalidatePath("/settings/tolerances");
};
