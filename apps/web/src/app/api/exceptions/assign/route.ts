import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assignException } from "@/lib/exceptions";
import { NotFoundError, ValidationError } from "@/lib/errors";

const assignSchema = z.object({
  exceptionId: z.string().uuid(),
  assignedToUserId: z.string().uuid().nullable().optional()
});

const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

export const POST = async (request: Request) => {
  const { session, user } = await requireUser();
  const body = await request.json();
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Invalid assignment request.");
  }

  try {
    const updated = await assignException(
      {
        firmId: session.firmId,
        userId: session.userId,
        role: user.role
      },
      parsed.data.exceptionId,
      parsed.data.assignedToUserId ?? null
    );
    return NextResponse.json({ id: updated.id });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorResponse(400, error.message);
    }
    if (error instanceof NotFoundError) {
      return errorResponse(404, error.message);
    }
    throw error;
  }
};
