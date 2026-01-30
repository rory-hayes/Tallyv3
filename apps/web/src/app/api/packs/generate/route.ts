import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { enqueueJob } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";
import { runJobInline } from "@/lib/job-runner";

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
    const payRun = await prisma.payRun.findFirst({
      where: {
        id: parsed.data.payRunId,
        firmId: session.firmId
      }
    });
    if (!payRun) {
      throw new NotFoundError("Pay run not found.");
    }

    const job = await enqueueJob({
      firmId: session.firmId,
      type: "PACK_GENERATE",
      payload: {
        firmId: session.firmId,
        payRunId: parsed.data.payRunId,
        actorUserId: session.userId,
        actorRole: user.role
      },
      payRunId: parsed.data.payRunId,
      maxAttempts: 1
    });

    if (process.env.JOBS_INLINE === "true") {
      await runJobInline(job);
    }

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return errorResponse(404, error.message);
    }
    throw error;
  }
};
