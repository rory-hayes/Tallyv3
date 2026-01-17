import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { PermissionError, requirePermission } from "@/lib/permissions";
import { getImportPreview } from "@/lib/import-preview";
import { NotFoundError, ValidationError } from "@/lib/errors";

const previewSchema = z.object({
  importId: z.string().uuid(),
  sheetName: z.string().optional().nullable()
});

const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

export const POST = async (request: Request) => {
  const { session, user } = await requireUser();

  try {
    requirePermission(user.role, "template:write");
  } catch (error) {
    if (error instanceof PermissionError) {
      return errorResponse(403, "Permission denied.");
    }
    throw error;
  }

  const body = await request.json();
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Invalid preview request.");
  }

  try {
    const preview = await getImportPreview(
      session.firmId,
      parsed.data.importId,
      parsed.data.sheetName
    );
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return errorResponse(404, error.message);
    }
    if (error instanceof ValidationError) {
      return errorResponse(400, error.message);
    }
    throw error;
  }
};
