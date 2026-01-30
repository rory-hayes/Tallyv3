import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { deleteImport } from "@/lib/imports";
import { PermissionError, requirePermission } from "@/lib/permissions";
import { NotFoundError, ValidationError } from "@/lib/errors";

const deleteSchema = z.object({
  importId: z.string().uuid()
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
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Invalid delete request.");
  }

  try {
    await deleteImport(
      {
        firmId: session.firmId,
        userId: session.userId,
        role: user.role
      },
      parsed.data.importId
    );
    return NextResponse.json({ ok: true });
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
