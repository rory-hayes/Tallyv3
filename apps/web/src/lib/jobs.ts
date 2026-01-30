import "server-only";

import { prisma, type Job, type JobStatus, type JobType } from "@/lib/prisma";

export type JobPayload = Record<string, unknown>;

export type EnqueueJobInput = {
  firmId: string | null;
  type: JobType;
  payload: JobPayload;
  runAt?: Date;
  maxAttempts?: number;
  payRunId?: string | null;
  importId?: string | null;
};

export const enqueueJob = async (input: EnqueueJobInput): Promise<Job> =>
  prisma.job.create({
    data: {
      firmId: input.firmId ?? undefined,
      type: input.type,
      payload: input.payload,
      runAt: input.runAt ?? new Date(),
      maxAttempts: input.maxAttempts ?? 3,
      payRunId: input.payRunId ?? undefined,
      importId: input.importId ?? undefined
    }
  });

export const getJobForFirm = async (
  firmId: string,
  jobId: string
): Promise<Job | null> =>
  prisma.job.findFirst({
    where: {
      id: jobId,
      firmId
    }
  });

export const isTerminalJobStatus = (status: JobStatus): boolean =>
  status === "SUCCEEDED" || status === "FAILED";
