import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { resolveException } from "@/lib/exceptions";
import { NotFoundError, ValidationError } from "@/lib/errors";

const resolveSchema = z.object({
  exceptionId: z.string().uuid(),
  note: z.string().min(2)
});

const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

export const POST = async (request: Request) => {
  const { session, user } = await requireUser();
  const body = await request.json();
  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Invalid resolution request.");
  }

  try {
    const updated = await resolveException(
      {
        firmId: session.firmId,
        userId: session.userId,
        role: user.role
      },
      parsed.data.exceptionId,
      parsed.data.note
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
