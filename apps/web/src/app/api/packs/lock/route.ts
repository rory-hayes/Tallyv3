import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { lockPack } from "@/lib/packs";
import { NotFoundError, ValidationError } from "@/lib/errors";

const lockSchema = z.object({
  payRunId: z.string().uuid()
});

const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

export const POST = async (request: Request) => {
  const { session, user } = await requireUser();
  const body = await request.json();
  const parsed = lockSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Invalid lock request.");
  }

  try {
    const pack = await lockPack(
      {
        firmId: session.firmId,
        userId: session.userId,
        role: user.role
      },
      parsed.data.payRunId
    );
    return NextResponse.json({ packId: pack.id });
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
