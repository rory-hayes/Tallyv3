import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { generatePack } from "@/lib/packs";
import { NotFoundError, ValidationError } from "@/lib/errors";

const generateSchema = z.object({
  payRunId: z.string().uuid()
});

const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

export const POST = async (request: Request) => {
  const { session, user } = await requireUser();
  const body = await request.json();
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Invalid pack request.");
  }

  try {
    const pack = await generatePack(
      {
        firmId: session.firmId,
        userId: session.userId,
        role: user.role
      },
      parsed.data.payRunId
    );
    return NextResponse.json({ packId: pack.id, packVersion: pack.packVersion });
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
