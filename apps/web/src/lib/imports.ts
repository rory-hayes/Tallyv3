import "server-only";

import { randomUUID } from "crypto";
import {
  prisma,
  Prisma,
  type ImportErrorCode,
  type ImportStatus,
  type SourceType,
  type Job
} from "@/lib/prisma";
import { recordAuditEvent } from "./audit";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { transitionPayRunStatus } from "./pay-runs";
import { assertImportTransition, isImportErrorStatus } from "./import-status";
import { storageBucket } from "./storage";
import { enqueueJob } from "./jobs";
import { runJobInline } from "./job-runner";

export type ImportInput = {
  payRunId: string;
  sourceType: SourceType;
  storageKey: string;
  fileHashSha256: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  parseStatus?: ImportStatus;
  errorCode?: ImportErrorCode | null;
  errorMessage?: string | null;
};

type ActorContext = {
  firmId: string;
  userId: string;
  role: "ADMIN" | "PREPARER" | "REVIEWER";
};

export type ImportCreateResult = {
  importRecord: Awaited<ReturnType<typeof prisma.import.create>>;
  duplicate: boolean;
};

export type ImportParseQueueResult = {
  job: Job;
  retry: boolean;
};

const allowedExtensions = [".csv", ".xlsx"];
const allowedMimeTypes = [
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel"
];

export const isAllowedUpload = (fileName: string, mimeType?: string): boolean => {
  const lowerName = fileName.toLowerCase();
  const hasAllowedExtension = allowedExtensions.some((ext) =>
    lowerName.endsWith(ext)
  );
  const hasAllowedMime = mimeType ? allowedMimeTypes.includes(mimeType) : false;
  return hasAllowedExtension || hasAllowedMime;
};

const sanitizeFileName = (name: string): string =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_");

export const buildStorageKey = (
  firmId: string,
  payRunId: string,
  sourceType: SourceType,
  fileName: string
): string => {
  const safeName = sanitizeFileName(fileName);
  return `firm/${firmId}/pay-run/${payRunId}/${sourceType}/${randomUUID()}-${safeName}`;
};

export const assertStorageKeyMatches = (
  firmId: string,
  payRunId: string,
  storageKey: string
) => {
  const prefix = `firm/${firmId}/pay-run/${payRunId}/`;
  if (!storageKey.startsWith(prefix)) {
    throw new ValidationError("Upload key does not match this pay run.");
  }
};

const getPayRunForImport = async (firmId: string, payRunId: string) => {
  const payRun = await prisma.payRun.findFirst({
    where: {
      id: payRunId,
      firmId
    }
  });

  if (!payRun) {
    throw new NotFoundError("Pay run not found.");
  }

  if (payRun.status === "LOCKED" || payRun.status === "ARCHIVED") {
    throw new ValidationError("Locked pay runs cannot accept new imports.");
  }

  return payRun;
};

const resolveStorageUri = (storageKey: string): string => {
  return `s3://${storageBucket}/${storageKey}`;
};

export const queueImportParse = async (
  context: ActorContext,
  importId: string,
  options?: { force?: boolean }
): Promise<ImportParseQueueResult> => {
  const importRecord = await prisma.import.findFirst({
    where: {
      id: importId,
      firmId: context.firmId,
      deletedAt: null
    }
  });

  if (!importRecord) {
    throw new NotFoundError("Import not found.");
  }

  await getPayRunForImport(context.firmId, importRecord.payRunId);

  const retry =
    options?.force === true && importRecord.parseStatus === "ERROR_PARSE_FAILED";

  if (isImportErrorStatus(importRecord.parseStatus) && !retry) {
    throw new ValidationError("This import failed validation. Re-upload the file.");
  }

  if (importRecord.parseStatus === "PARSING") {
    throw new ValidationError("This import is already parsing.");
  }

  if (
    importRecord.parseStatus === "PARSED" ||
    importRecord.parseStatus === "MAPPED" ||
    importRecord.parseStatus === "READY"
  ) {
    throw new ValidationError("This import has already been parsed.");
  }

  const fromStatus = retry ? "ERROR_PARSE_FAILED" : importRecord.parseStatus;
  assertImportTransition(fromStatus, "PARSING");

  await prisma.import.update({
    where: { id: importRecord.id },
    data: {
      parseStatus: "PARSING",
      parseSummary: Prisma.JsonNull,
      errorCode: null,
      errorMessage: null
    }
  });

  await recordAuditEvent(
    {
      action: "IMPORT_PARSING_STARTED",
      entityType: "IMPORT",
      entityId: importRecord.id,
      metadata: {
        sourceType: importRecord.sourceType,
        version: importRecord.version,
        retry
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  const job = await enqueueJob({
    firmId: context.firmId,
    type: "IMPORT_PARSE",
    payload: {
      firmId: context.firmId,
      importId: importRecord.id,
      actorUserId: context.userId,
      retry
    },
    payRunId: importRecord.payRunId,
    importId: importRecord.id,
    maxAttempts: 2
  });

  if (process.env.JOBS_INLINE === "true") {
    await runJobInline(job);
  }

  return { job, retry };
};

export const deleteImport = async (
  context: ActorContext,
  importId: string
) => {
  const importRecord = await prisma.import.findFirst({
    where: {
      id: importId,
      firmId: context.firmId,
      deletedAt: null
    },
    include: {
      payRun: true
    }
  });

  if (!importRecord) {
    throw new NotFoundError("Import not found.");
  }

  if (importRecord.payRun.status === "LOCKED" || importRecord.payRun.status === "ARCHIVED") {
    throw new ValidationError("Locked pay runs cannot delete imports.");
  }

  const deletedAt = new Date();
  const updated = await prisma.import.update({
    where: { id: importRecord.id },
    data: {
      deletedAt,
      deletedByUserId: context.userId
    }
  });

  await recordAuditEvent(
    {
      action: "IMPORT_DELETED",
      entityType: "IMPORT",
      entityId: importRecord.id,
      metadata: {
        payRunId: importRecord.payRunId,
        sourceType: importRecord.sourceType,
        version: importRecord.version
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  return updated;
};

export const createImport = async (
  context: ActorContext,
  input: ImportInput
): Promise<ImportCreateResult> => {
  const payRun = await getPayRunForImport(context.firmId, input.payRunId);

  if (payRun.status === "DRAFT" && context.role === "REVIEWER") {
    throw new ValidationError(
      "Reviewers cannot start imports on draft pay runs."
    );
  }

  const client = await prisma.client.findFirst({
    where: {
      id: payRun.clientId,
      firmId: context.firmId
    }
  });

  if (!client) {
    throw new NotFoundError("Client not found.");
  }

  const existing = await prisma.import.findFirst({
    where: {
      payRunId: input.payRunId,
      sourceType: input.sourceType,
      fileHashSha256: input.fileHashSha256
    }
  });

  if (existing) {
    return { importRecord: existing, duplicate: true };
  }

  const latest = await prisma.import.findFirst({
    where: {
      payRunId: input.payRunId,
      sourceType: input.sourceType
    },
    orderBy: { version: "desc" }
  });

  const nextVersion = latest ? latest.version + 1 : 1;
  const storageUri = resolveStorageUri(input.storageKey);

  const parseStatus = input.parseStatus ?? ("UPLOADED" as ImportStatus);
  const errorCode = input.errorCode ?? null;
  const errorMessage = input.errorMessage ?? null;

  let importRecord;
  try {
    importRecord = await prisma.import.create({
      data: {
        firmId: context.firmId,
        clientId: client.id,
        payRunId: input.payRunId,
        sourceType: input.sourceType,
        version: nextVersion,
        storageUri,
        fileHashSha256: input.fileHashSha256,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        uploadedByUserId: context.userId,
        parseStatus,
        errorCode,
        errorMessage
      }
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new ConflictError("An import already exists for this file.");
    }
    throw error;
  }

  if (payRun.status === "DRAFT") {
    await transitionPayRunStatus(
      {
        firmId: context.firmId,
        userId: context.userId,
        role: context.role
      },
      payRun.id,
      "IMPORTED"
    );
  }

  const action = nextVersion === 1 ? "IMPORT_UPLOADED" : "IMPORT_REPLACED";
  await recordAuditEvent(
    {
      action,
      entityType: "IMPORT",
      entityId: importRecord.id,
      metadata: {
        payRunId: importRecord.payRunId,
        sourceType: importRecord.sourceType,
        version: importRecord.version,
        previousImportId: latest?.id
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  if (isImportErrorStatus(parseStatus)) {
    await recordAuditEvent(
      {
        action: "IMPORT_ERROR",
        entityType: "IMPORT",
        entityId: importRecord.id,
        metadata: {
          sourceType: importRecord.sourceType,
          version: importRecord.version,
          errorCode: parseStatus
        }
      },
      {
        firmId: context.firmId,
        actorUserId: context.userId
      }
    );
  }

  return { importRecord, duplicate: false };
};
