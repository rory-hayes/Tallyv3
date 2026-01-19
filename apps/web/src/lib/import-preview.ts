import "server-only";

import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "./errors";
import { readImportFile } from "./import-file";
import { startSpan, withRetry } from "./logger";

const MAX_PREVIEW_ROWS = 25;
const countColumns = (rows: string[][]) =>
  rows.reduce((max, row) => Math.max(max, row.length), 0);

export const getImportPreview = async (
  firmId: string,
  importId: string,
  sheetName?: string | null
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

  const shouldUpdateStatus =
    importRecord.parseStatus !== "MAPPED" && importRecord.parseStatus !== "READY";

  if (shouldUpdateStatus) {
    await prisma.import.update({
      where: { id: importRecord.id },
      data: { parseStatus: "PARSING" }
    });
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
      previewRowCount: preview.rows.length,
      previewColumnCount: countColumns(preview.rows),
      sheetName: preview.sheetName,
      sheetNames: preview.sheetNames
    };

    await prisma.import.update({
      where: { id: importRecord.id },
      data: {
        parseStatus: shouldUpdateStatus ? "PARSED" : importRecord.parseStatus,
        parseSummary
      }
    });

    span.end({ status: "SUCCESS" });
    return preview;
  } catch (error) {
    await prisma.import.update({
      where: { id: importRecord.id },
      data: {
        parseStatus: "ERROR",
        parseSummary: {
          error: error instanceof Error ? error.message : "Unable to parse file."
        }
      }
    });
    span.fail(error, { status: "FAILED" });
    throw error;
  }
};
