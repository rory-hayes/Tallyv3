import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { submitPayRunForReview } from "@/lib/pay-run-review";
import { NotFoundError, ValidationError } from "@/lib/errors";

const submitSchema = z.object({
  payRunId: z.string().uuid()
});

const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

export const POST = async (request: Request) => {
  const { session, user } = await requireUser();
  const body = await request.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Invalid review submission.");
  }

  try {
    const updated = await submitPayRunForReview(
      {
        firmId: session.firmId,
        userId: session.userId,
        role: user.role
      },
      parsed.data.payRunId
    );
    return NextResponse.json({ id: updated.id, status: updated.status });
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
