import { Prisma, prisma, type Job } from "@tally/db";
import { generatePack } from "@/lib/packs";
import { runReconciliation } from "@/lib/reconciliation";
import { logError, logInfo } from "@/lib/logger";

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

const WORKER_ID = process.env.WORKER_ID ?? `worker-${process.pid}`;
const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 5;

const claimJobs = async (limit: number): Promise<Job[]> => {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.$queryRaw<Job[]>(Prisma.sql`
      WITH cte AS (
        SELECT id
        FROM "Job"
        WHERE status = 'QUEUED'
          AND "runAt" <= NOW()
        ORDER BY "runAt" ASC, "createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "Job" AS job
      SET status = 'RUNNING',
          "lockedAt" = NOW(),
          "lockedBy" = ${WORKER_ID},
          "attempts" = job."attempts" + 1
      FROM cte
      WHERE job.id = cte.id
      RETURNING job.*;
    `);
    return claimed;
  });
};

const markJobSucceeded = async (jobId: string) => {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "SUCCEEDED",
      lockedAt: null,
      lockedBy: null,
      lastError: null
    }
  });
};

const markJobFailed = async (job: Job, error: unknown) => {
  const message = error instanceof Error ? error.message : "Job failed.";
  const reachedMax = job.attempts >= job.maxAttempts;
  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: reachedMax ? "FAILED" : "QUEUED",
      lockedAt: null,
      lockedBy: null,
      lastError: message,
      runAt: reachedMax ? job.runAt : new Date(Date.now() + 2_000)
    }
  });
};

const handleJob = async (job: Job) => {
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

const processJobs = async () => {
  const jobs = await claimJobs(BATCH_SIZE);
  if (jobs.length === 0) {
    return;
  }

  for (const job of jobs) {
    try {
      logInfo("JOB_STARTED", { jobId: job.id, jobName: job.type });
      await handleJob(job);
      await markJobSucceeded(job.id);
      logInfo("JOB_SUCCEEDED", { jobId: job.id, jobName: job.type });
    } catch (error) {
      logError("JOB_FAILED", { jobId: job.id, jobName: job.type });
      await markJobFailed(job, error);
    }
  }
};

const boot = async (): Promise<void> => {
  logInfo("WORKER_BOOTED", { jobName: "scheduler" });
  await processJobs();
  setInterval(() => {
    void processJobs().catch((error) => {
      logError("WORKER_LOOP_FAILED", {
        errorName: error instanceof Error ? error.name : "UnknownError"
      });
    });
  }, POLL_INTERVAL_MS);
};

boot().catch((error) => {
  logError("WORKER_BOOT_FAILED", {
    errorName: error instanceof Error ? error.name : "UnknownError"
  });
  process.exit(1);
});
