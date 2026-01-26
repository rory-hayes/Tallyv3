"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit";

const parseCheckbox = (formData: FormData, key: string) =>
  formData.get(key) === "on";

export const updateApprovalSettingsAction = async (formData: FormData) => {
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

  const approvalSettings = {
    allowSelfApproval: parseCheckbox(formData, "allowSelfApproval")
  };

  await prisma.firm.update({
    where: { id: firm.id },
    data: {
      defaults: {
        ...defaults,
        approvalSettings
      }
    }
  });

  await recordAuditEvent(
    {
      action: "APPROVAL_SETTINGS_UPDATED",
      entityType: "FIRM",
      entityId: firm.id,
      metadata: {
        allowSelfApproval: approvalSettings.allowSelfApproval
      }
    },
    {
      firmId: firm.id,
      actorUserId: user.id
    }
  );

  revalidatePath("/settings/approvals");
};
