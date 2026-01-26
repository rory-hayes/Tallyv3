import "server-only";

import { prisma, type ImportStatus } from "@/lib/prisma";
import {
  ImportFileInvalidError,
  NotFoundError,
  ValidationError
} from "./errors";
import { readImportFile } from "./import-file";
import { recordAuditEvent } from "./audit";
import { startSpan, withRetry } from "./logger";
import { assertImportTransition, isImportErrorStatus } from "./import-status";

const MAX_PREVIEW_ROWS = 25;
const countColumns = (rows: string[][]) =>
  rows.reduce((max, row) => Math.max(max, row.length), 0);

export const getImportPreview = async (
  firmId: string,
  importId: string,
  sheetName?: string | null,
  actorUserId?: string | null
) => {
  const span = startSpan("IMPORT_PREVIEW", { firmId, importId });
  const importRecord = await prisma.import.findFirst({
    where: {
      id: importId,
      firmId
    }
  });

  if (!importRecord) {
    throw new NotFoundError("Import not found.");
  }

  if (isImportErrorStatus(importRecord.parseStatus)) {
    throw new ValidationError("This import failed validation. Re-upload the file.");
  }

  const shouldUpdateStatus =
    importRecord.parseStatus === "UPLOADED" || importRecord.parseStatus === "PARSING";

  if (shouldUpdateStatus) {
    assertImportTransition(importRecord.parseStatus, "PARSING");
    await prisma.import.update({
      where: { id: importRecord.id },
      data: {
        parseStatus: "PARSING",
        errorCode: null,
        errorMessage: null
      }
    });

    if (importRecord.parseStatus === "UPLOADED") {
      await recordAuditEvent(
        {
          action: "IMPORT_PARSING_STARTED",
          entityType: "IMPORT",
          entityId: importRecord.id,
          metadata: {
            sourceType: importRecord.sourceType,
            version: importRecord.version
          }
        },
        {
          firmId,
          actorUserId: actorUserId ?? null
        }
      );
    }
  }

  try {
    const preview = await withRetry(
      () =>
        readImportFile(importRecord, {
          sheetName: sheetName ?? null,
          maxRows: MAX_PREVIEW_ROWS
        }),
      {
        event: "IMPORT_PREVIEW_READ",
        context: { firmId, importId },
        shouldRetry: (error) => !(error instanceof ValidationError)
      }
    );

    const parseSummary = {
      rowCount: preview.rowCount,
      columnCount: preview.columnCount,
      previewRowCount: preview.rows.length,
      previewColumnCount: countColumns(preview.rows),
      sheetName: preview.sheetName,
      sheetNames: preview.sheetNames
    };

    const nextStatus: ImportStatus = shouldUpdateStatus
      ? "PARSED"
      : importRecord.parseStatus;

    if (shouldUpdateStatus) {
      assertImportTransition("PARSING", nextStatus);
    }

    await prisma.import.update({
      where: { id: importRecord.id },
      data: {
        parseStatus: nextStatus,
        parseSummary,
        errorCode: null,
        errorMessage: null
      }
    });

    if (shouldUpdateStatus) {
      await recordAuditEvent(
        {
          action: "IMPORT_PARSED",
          entityType: "IMPORT",
          entityId: importRecord.id,
          metadata: {
            sourceType: importRecord.sourceType,
            version: importRecord.version,
            rowCount: preview.rowCount,
            columnCount: preview.columnCount,
            sheetCount: preview.sheetNames.length
          }
        },
        {
          firmId,
          actorUserId: actorUserId ?? null
        }
      );
    }

    span.end({ status: "SUCCESS" });
    return preview;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to parse file.";
    const errorCode =
      error instanceof ImportFileInvalidError
        ? "ERROR_FILE_INVALID"
        : "ERROR_PARSE_FAILED";

    if (shouldUpdateStatus) {
      assertImportTransition("PARSING", errorCode);
    }

    await prisma.import.update({
      where: { id: importRecord.id },
      data: {
        parseStatus: errorCode,
        errorCode,
        errorMessage: message,
        parseSummary: { error: message }
      }
    });
    await recordAuditEvent(
      {
        action: "IMPORT_ERROR",
        entityType: "IMPORT",
        entityId: importRecord.id,
        metadata: {
          sourceType: importRecord.sourceType,
          version: importRecord.version,
          errorCode
        }
      },
      {
        firmId,
        actorUserId: actorUserId ?? null
      }
    );
    span.fail(error, { status: "FAILED" });
    throw error;
  }
};
