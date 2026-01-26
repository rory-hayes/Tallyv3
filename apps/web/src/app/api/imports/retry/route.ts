import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getImportPreview } from "@/lib/import-preview";
import { PermissionError, requirePermission } from "@/lib/permissions";
import { ValidationError } from "@/lib/errors";

const retrySchema = z.object({
  importId: z.string().uuid(),
  sheetName: z.string().optional().nullable()
});

const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

export const POST = async (request: Request) => {
  const { session, user } = await requireUser();

  try {
    requirePermission(user.role, "import:upload");
  } catch (error) {
    if (error instanceof PermissionError) {
      return errorResponse(403, "Permission denied.");
    }
    throw error;
  }

  const body = await request.json();
  const parsed = retrySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Invalid retry request.");
  }

  try {
    await getImportPreview(
      session.firmId,
      parsed.data.importId,
      parsed.data.sheetName ?? null,
      session.userId,
      { force: true }
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorResponse(400, error.message);
    }
    throw error;
  }
};
