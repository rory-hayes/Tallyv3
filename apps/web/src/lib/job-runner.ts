import "server-only";

import { prisma, type Job } from "@/lib/prisma";
import { runReconciliation } from "@/lib/reconciliation";
import { generatePack } from "@/lib/packs";
import { getImportPreview } from "@/lib/import-preview";

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

type ImportParsePayload = {
  firmId: string;
  importId: string;
  actorUserId: string;
  retry?: boolean;
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
    case "IMPORT_PARSE": {
      const data = payload as ImportParsePayload;
      const firmId = data.firmId ?? job.firmId ?? "";
      if (!firmId) {
        throw new Error("Import parse job missing firmId.");
      }
      const importRecord = await prisma.import.findFirst({
        where: {
          id: data.importId,
          firmId
        }
      });
      if (!importRecord || importRecord.deletedAt) {
        return;
      }
      const canRetry =
        data.retry === true && importRecord.parseStatus === "ERROR_PARSE_FAILED";
      const shouldParse =
        importRecord.parseStatus === "UPLOADED" ||
        importRecord.parseStatus === "PARSING" ||
        canRetry;
      if (!shouldParse) {
        return;
      }
      await getImportPreview(firmId, importRecord.id, null, data.actorUserId, {
        force: data.retry === true
      });
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
