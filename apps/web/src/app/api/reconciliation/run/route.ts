import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { runReconciliation } from "@/lib/reconciliation";
import { NotFoundError, ValidationError } from "@/lib/errors";

const runSchema = z.object({
  payRunId: z.string().uuid()
});

const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

export const POST = async (request: Request) => {
  const { session, user } = await requireUser();
  const body = await request.json();
  const parsed = runSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Invalid reconciliation request.");
  }

  try {
    const result = await runReconciliation(
      {
        firmId: session.firmId,
        userId: session.userId,
        role: user.role
      },
      parsed.data.payRunId
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PermissionError) {
      return errorResponse(403, "Permission denied.");
    }
    if (error instanceof ValidationError) {
      return errorResponse(400, error.message);
    }
    if (error instanceof NotFoundError) {
      return errorResponse(404, error.message);
    }
    throw error;
  }
};
