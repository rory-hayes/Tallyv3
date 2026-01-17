import "server-only";

import { prisma } from "@tally/db";
import { NotFoundError } from "./errors";
import { readImportFile } from "./import-file";

const MAX_PREVIEW_ROWS = 25;

export const getImportPreview = async (
  firmId: string,
  importId: string,
  sheetName?: string | null
) => {
  const importRecord = await prisma.import.findFirst({
    where: {
      id: importId,
      firmId
    }
  });

  if (!importRecord) {
    throw new NotFoundError("Import not found.");
  }

  return readImportFile(importRecord, {
    sheetName: sheetName ?? null,
    maxRows: MAX_PREVIEW_ROWS
  });
};
