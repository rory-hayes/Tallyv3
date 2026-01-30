import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { PermissionError, requirePermission } from "@/lib/permissions";
import { enqueueJob } from "@/lib/jobs";
import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { runJobInline } from "@/lib/job-runner";

const runSchema = z.object({
  payRunId: z.string().uuid()
});

const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

export const POST = async (request: Request) => {
  const { session, user } = await requireUser();
  try {
    requirePermission(user.role, "reconciliation:run");
  } catch (error) {
    if (error instanceof PermissionError) {
      return errorResponse(403, "Permission denied.");
    }
    throw error;
  }
  const body = await request.json();
  const parsed = runSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Invalid reconciliation request.");
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
      type: "RECONCILIATION_RUN",
      payload: {
        firmId: session.firmId,
        payRunId: parsed.data.payRunId,
        actorUserId: session.userId,
        actorRole: user.role
      },
      payRunId: parsed.data.payRunId,
      maxAttempts: 2
    });

    if (process.env.JOBS_INLINE === "true") {
      await runJobInline(job);
    }

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    if (error instanceof PermissionError) {
      return errorResponse(403, "Permission denied.");
    }
    if (error instanceof NotFoundError) {
      return errorResponse(404, error.message);
    }
    throw error;
  }
};
