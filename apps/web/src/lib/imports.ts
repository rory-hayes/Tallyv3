import "server-only";

import { randomUUID } from "crypto";
import {
  prisma,
  type ImportParseStatus,
  type SourceType
} from "@tally/db";
import { recordAuditEvent } from "./audit";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { transitionPayRunStatus } from "./pay-runs";
import { storageBucket } from "./storage";

export type ImportInput = {
  payRunId: string;
  sourceType: SourceType;
  storageKey: string;
  fileHashSha256: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
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

const allowedExtensions = [".csv", ".xlsx", ".xls"];
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
        parseStatus: "PENDING" as ImportParseStatus
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

  return { importRecord, duplicate: false };
};
