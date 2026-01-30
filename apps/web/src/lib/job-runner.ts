import "server-only";

import { prisma, type Job } from "@/lib/prisma";
import { runReconciliation } from "@/lib/reconciliation";
import { generatePack } from "@/lib/packs";

type JobPayload = Record<string, unknown>;

type ReconciliationPayload = {
  firmId: string;
  payRunId: string;
  actorUserId: string;
  actorRole: "ADMIN" | "PREPARER" | "REVIEWER";
};

type PackPayload = {
  firmId: string;
  payRunId: string;
  actorUserId: string;
  actorRole: "ADMIN" | "PREPARER" | "REVIEWER";
};

const handleInlineJob = async (job: Job) => {
  const payload = job.payload as JobPayload;
  switch (job.type) {
    case "RECONCILIATION_RUN": {
      const data = payload as ReconciliationPayload;
      await runReconciliation(
        {
          firmId: data.firmId ?? job.firmId ?? "",
          userId: data.actorUserId,
          role: data.actorRole
        },
        data.payRunId
      );
      return;
    }
    case "PACK_GENERATE": {
      const data = payload as PackPayload;
      await generatePack(
        {
          firmId: data.firmId ?? job.firmId ?? "",
          userId: data.actorUserId,
          role: data.actorRole
        },
        data.payRunId
      );
      return;
    }
    default:
      throw new Error(`Unsupported job type: ${job.type}`);
  }
};

export const runJobInline = async (job: Job) => {
  await prisma.job.update({
    where: { id: job.id },
    data: { status: "RUNNING", lockedAt: new Date(), lockedBy: "inline" }
  });

  try {
    await handleInlineJob(job);
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "SUCCEEDED", lockedAt: null, lockedBy: null, lastError: null }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed.";
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        lockedAt: null,
        lockedBy: null,
        lastError: message
      }
    });
    throw error;
  }
};
