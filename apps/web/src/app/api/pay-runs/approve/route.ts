import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { approvePayRun } from "@/lib/pay-run-review";
import { NotFoundError, ValidationError } from "@/lib/errors";

const approveSchema = z.object({
  payRunId: z.string().uuid(),
  comment: z.string().optional().nullable(),
  noComment: z.boolean().optional()
});

const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

export const POST = async (request: Request) => {
  const { session, user } = await requireUser();
  const body = await request.json();
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Invalid approval request.");
  }

  try {
    const approval = await approvePayRun(
      {
        firmId: session.firmId,
        userId: session.userId,
        role: user.role
      },
      parsed.data.payRunId,
      {
        comment: parsed.data.comment ?? null,
        noComment: parsed.data.noComment === true
      }
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
