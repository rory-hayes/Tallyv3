"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { PermissionError, requirePermission } from "@/lib/permissions";
import { updateTemplateStatus } from "@/lib/mapping-templates";
import { NotFoundError, ValidationError } from "@/lib/errors";

export type TemplateStatusState = {
  error?: string;
};

const statusSchema = z.object({
  templateId: z.string().uuid(),
  status: z.enum(["ACTIVE", "DEPRECATED"])
});

const handleTemplateStatusError = (error: unknown): TemplateStatusState => {
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

export const updateTemplateStatusAction = async (
  _prevState: TemplateStatusState,
  formData: FormData
): Promise<TemplateStatusState> => {
  const { session, user } = await requireUser();

  try {
    requirePermission(user.role, "template:write");
    if (user.role === "REVIEWER") {
      throw new PermissionError();
    }
  } catch (error) {
    return handleTemplateStatusError(error);
  }

  const parsed = statusSchema.safeParse({
    templateId: formData.get("templateId"),
    status: formData.get("status")
  });

  if (!parsed.success) {
    return { error: "Provide a valid template status change." };
  }

  try {
    await updateTemplateStatus(
      {
        firmId: session.firmId,
        userId: session.userId,
        role: user.role
      },
      parsed.data.templateId,
      parsed.data.status
    );
  } catch (error) {
    return handleTemplateStatusError(error);
  }

  revalidatePath("/templates");
  revalidatePath(`/templates/${parsed.data.templateId}`);
  redirect(`/templates/${parsed.data.templateId}`);
};
