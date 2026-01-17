import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { rejectPayRun } from "@/lib/pay-run-review";
import { NotFoundError, ValidationError } from "@/lib/errors";

const rejectSchema = z.object({
  payRunId: z.string().uuid(),
  comment: z.string().min(2)
});

const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

export const POST = async (request: Request) => {
  const { session, user } = await requireUser();
  const body = await request.json();
  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Invalid rejection request.");
  }

  try {
    const approval = await rejectPayRun(
      {
        firmId: session.firmId,
        userId: session.userId,
        role: user.role
      },
      parsed.data.payRunId,
      parsed.data.comment
    );
    return NextResponse.json({ id: approval.id, status: approval.status });
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
