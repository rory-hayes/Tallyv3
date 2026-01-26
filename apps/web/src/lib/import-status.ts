import "server-only";

import type { ImportStatus } from "@/lib/prisma";
import { ValidationError } from "./errors";

const errorStatuses: ImportStatus[] = [
  "ERROR_FILE_INVALID",
  "ERROR_PARSE_FAILED"
];

const allowedTransitions: Record<ImportStatus, ImportStatus[]> = {
  UPLOADED: ["PARSING", "ERROR_FILE_INVALID", "ERROR_PARSE_FAILED"],
  PARSING: [
    "PARSED",
    "MAPPING_REQUIRED",
    "MAPPED",
    "ERROR_FILE_INVALID",
    "ERROR_PARSE_FAILED"
  ],
  PARSED: ["MAPPING_REQUIRED", "MAPPED", "READY", "ERROR_PARSE_FAILED"],
  MAPPING_REQUIRED: ["MAPPED", "READY", "ERROR_PARSE_FAILED"],
  MAPPED: ["READY"],
  READY: ["MAPPED"],
  ERROR_FILE_INVALID: [],
  ERROR_PARSE_FAILED: []
};

export const isImportErrorStatus = (status: ImportStatus): boolean =>
  errorStatuses.includes(status);

export const assertImportTransition = (
  from: ImportStatus,
  to: ImportStatus
) => {
  if (from === to) {
    return;
  }
  const allowed = allowedTransitions[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ValidationError(`Import cannot move from ${from} to ${to}.`);
  }
};
