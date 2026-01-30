import "server-only";

import { prisma, type Job, type SourceType } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "./errors";
import { readImportFile } from "./import-file";
import { normalizeColumnName, type ColumnMap } from "./mapping-utils";
import { recordAuditEvent } from "./audit";
import { assertImportTransition, isImportErrorStatus } from "./import-status";
import { enqueueJob } from "./jobs";
import { runJobInline } from "./job-runner";
import { withRetry } from "./logger";

export const NORMALIZATION_VERSION = "v1";

type ActorContext = {
  firmId: string;
  userId: string;
  role: "ADMIN" | "PREPARER" | "REVIEWER";
};

type NormalizedRowBase = {
  rowNumber: number;
  sourceRow: string[];
};

type NormalizedRegisterRow = NormalizedRowBase & {
  employeeKey: string | null;
  gross: number | null;
  net: number | null;
  tax1: number | null;
  tax2: number | null;
  tax3: number | null;
  pensionEmployee: number | null;
  pensionEmployer: number | null;
  otherDeductions: number | null;
};

type NormalizedPaymentRow = NormalizedRowBase & {
  payeeKey: string | null;
  amount: number | null;
  reference: string | null;
};

type NormalizedJournalRow = NormalizedRowBase & {
  account: string | null;
  description: string | null;
  costCentre: string | null;
  amount: number | null;
};

type NormalizedStatutoryRow = NormalizedRowBase & {
  category: string | null;
  categoryKey: string | null;
  amount: number | null;
};

type NormalizedPensionScheduleRow = NormalizedRowBase & {
  employeeKey: string | null;
  pensionEmployee: number | null;
  pensionEmployer: number | null;
  pensionTotal: number | null;
};

export type NormalizedRow =
  | NormalizedRegisterRow
  | NormalizedPaymentRow
  | NormalizedJournalRow
  | NormalizedStatutoryRow
  | NormalizedPensionScheduleRow;

type NormalizedDatasetPayload = {
  headerRowIndex: number;
  headerRow: string[];
  rowCount: number;
  rows: NormalizedRow[];
};

export type ParsedDataset = {
  rows: string[][];
  headerRowIndex: number;
  columnIndexByNormalized: Map<string, number>;
};

const parseAmount = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  const isParenNegative = raw.startsWith("(") && raw.endsWith(")");
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (!cleaned) {
    return null;
  }
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return isParenNegative ? -Math.abs(parsed) : parsed;
};

const buildColumnIndexMap = (headerRow: string[]) => {
  const columnIndexByNormalized = new Map<string, number>();
  headerRow.forEach((column, index) => {
    const normalized = normalizeColumnName(String(column));
    if (normalized) {
      columnIndexByNormalized.set(normalized, index);
    }
  });
  if (columnIndexByNormalized.size === 0) {
    throw new ValidationError("No columns were detected for this import.");
  }
  return columnIndexByNormalized;
};

const resolveColumnIndex = (
  columnIndexByNormalized: Map<string, number>,
  columnName: string | null | undefined
) => {
  if (!columnName) {
    return null;
  }
  const normalized = normalizeColumnName(columnName);
  if (!normalized) {
    return null;
  }
  return columnIndexByNormalized.get(normalized) ?? null;
};

const getCellValue = (row: string[], columnIndex: number | null) => {
  if (columnIndex === null) {
    return "";
  }
  return row[columnIndex] ?? "";
};

const getStringValue = (row: string[], columnIndex: number | null) => {
  const value = getCellValue(row, columnIndex);
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getNumberValue = (row: string[], columnIndex: number | null) =>
  columnIndex === null ? null : parseAmount(getCellValue(row, columnIndex));

const isRowEmpty = (row: string[]) =>
  row.every((cell) => String(cell).trim().length === 0);

const buildNormalizedRows = ({
  sourceType,
  rows,
  headerRowIndex,
  columnMap,
  normalizationRules
}: {
  sourceType: SourceType;
  rows: string[][];
  headerRowIndex: number;
  columnMap: ColumnMap;
  normalizationRules: Record<string, unknown> | null;
}): NormalizedDatasetPayload => {
  if (rows.length === 0 || headerRowIndex >= rows.length) {
    throw new ValidationError("Unable to locate the header row for this import.");
  }
  const headerRow = rows[headerRowIndex] ?? [];
  const columnIndexByNormalized = buildColumnIndexMap(headerRow);

  const normalizedRows: NormalizedRow[] = [];
  const resolveIndex = (key: string) =>
    resolveColumnIndex(columnIndexByNormalized, columnMap[key] ?? null);

  const indices = {
    employeeId: resolveIndex("employeeId"),
    employeeName: resolveIndex("employeeName"),
    netPay: resolveIndex("netPay"),
    grossPay: resolveIndex("grossPay"),
    tax1: resolveIndex("tax1"),
    tax2: resolveIndex("tax2"),
    tax3: resolveIndex("tax3"),
    pensionEmployee: resolveIndex("pensionEmployee"),
    pensionEmployer: resolveIndex("pensionEmployer"),
    otherDeductions: resolveIndex("otherDeductions"),
    payeeId: resolveIndex("payeeId"),
    payeeName: resolveIndex("payeeName"),
    amount: resolveIndex("amount"),
    reference: resolveIndex("reference"),
    account: resolveIndex("account"),
    description: resolveIndex("description"),
    costCentre: resolveIndex("costCentre"),
    signedAmount: resolveIndex("signedAmount"),
    debit: resolveIndex("debit"),
    credit: resolveIndex("credit"),
    category: resolveIndex("category")
  };

  const rawCategoryMap =
    (normalizationRules as { categoryMap?: Record<string, string | null> } | null)
      ?.categoryMap ?? {};
  const categoryMap = Object.fromEntries(
    Object.entries(rawCategoryMap)
      .map(([key, value]) => [normalizeColumnName(key), value])
      .filter(([key]) => Boolean(key))
  ) as Record<string, string | null>;

  rows.forEach((row, rowIndex) => {
    if (rowIndex <= headerRowIndex) {
      return;
    }
    if (isRowEmpty(row)) {
      return;
    }
    const rowNumber = rowIndex + 1;
    const sourceRow = row.map((cell) => String(cell ?? ""));

    if (sourceType === "REGISTER") {
      const employeeKey =
        getStringValue(row, indices.employeeId) ??
        getStringValue(row, indices.employeeName);
      normalizedRows.push({
        rowNumber,
        sourceRow,
        employeeKey,
        gross: getNumberValue(row, indices.grossPay),
        net: getNumberValue(row, indices.netPay),
        tax1: getNumberValue(row, indices.tax1),
        tax2: getNumberValue(row, indices.tax2),
        tax3: getNumberValue(row, indices.tax3),
        pensionEmployee: getNumberValue(row, indices.pensionEmployee),
        pensionEmployer: getNumberValue(row, indices.pensionEmployer),
        otherDeductions: getNumberValue(row, indices.otherDeductions)
      });
      return;
    }

    if (sourceType === "BANK") {
      const payeeKey =
        getStringValue(row, indices.payeeId) ??
        getStringValue(row, indices.payeeName);
      normalizedRows.push({
        rowNumber,
        sourceRow,
        payeeKey,
        amount: getNumberValue(row, indices.amount),
        reference: getStringValue(row, indices.reference)
      });
      return;
    }

    if (sourceType === "GL") {
      let amount = getNumberValue(row, indices.signedAmount);
      if (amount === null) {
        const debit = getNumberValue(row, indices.debit) ?? 0;
        const credit = getNumberValue(row, indices.credit) ?? 0;
        if (debit !== 0 || credit !== 0) {
          amount = debit - credit;
        }
      }
      normalizedRows.push({
        rowNumber,
        sourceRow,
        account: getStringValue(row, indices.account),
        description: getStringValue(row, indices.description),
        costCentre: getStringValue(row, indices.costCentre),
        amount
      });
      return;
    }

    if (sourceType === "STATUTORY") {
      const category = getStringValue(row, indices.category);
      const normalizedKey = category ? normalizeColumnName(category) : "";
      const categoryKey = normalizedKey ? categoryMap[normalizedKey] ?? null : null;
      normalizedRows.push({
        rowNumber,
        sourceRow,
        category,
        categoryKey,
        amount: getNumberValue(row, indices.amount)
      });
      return;
    }

    const employeeKey =
      getStringValue(row, indices.employeeId) ??
      getStringValue(row, indices.employeeName);
    const pensionEmployee = getNumberValue(row, indices.pensionEmployee);
    const pensionEmployer = getNumberValue(row, indices.pensionEmployer);
    const total = getNumberValue(row, indices.amount);
    normalizedRows.push({
      rowNumber,
      sourceRow,
      employeeKey,
      pensionEmployee,
      pensionEmployer,
      pensionTotal:
        total ??
        (pensionEmployee !== null || pensionEmployer !== null
          ? (pensionEmployee ?? 0) + (pensionEmployer ?? 0)
          : null)
    });
  });

  return {
    headerRowIndex,
    headerRow: headerRow.map((cell) => String(cell ?? "")),
    rowCount: rows.length,
    rows: normalizedRows
  };
};

const coerceHeaderRow = (headerRow: unknown): string[] =>
  Array.isArray(headerRow) ? headerRow.map((cell) => String(cell ?? "")) : [];

const coerceNormalizedRows = (rows: unknown): NormalizedRow[] =>
  Array.isArray(rows) ? (rows as NormalizedRow[]) : [];

export const buildParsedDataset = (dataset: {
  headerRowIndex: number;
  headerRow: unknown;
  rows: unknown;
}): ParsedDataset => {
  const headerRowIndex = dataset.headerRowIndex ?? 0;
  const headerRow = coerceHeaderRow(dataset.headerRow);
  const columnIndexByNormalized = buildColumnIndexMap(headerRow);
  const normalizedRows = coerceNormalizedRows(dataset.rows);
  const rows: string[][] = [];

  if (headerRow.length > 0) {
    rows[headerRowIndex] = headerRow;
  }

  for (const row of normalizedRows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const rowNumber = (row as NormalizedRow).rowNumber;
    const sourceRow = (row as NormalizedRow).sourceRow;
    if (!rowNumber || !Array.isArray(sourceRow)) {
      continue;
    }
    rows[rowNumber - 1] = sourceRow.map((cell) => String(cell ?? ""));
  }

  return { rows, headerRowIndex, columnIndexByNormalized };
};

export const getNormalizedDataset = async (
  firmId: string,
  importId: string
) =>
  prisma.normalizedDataset.findFirst({
    where: {
      firmId,
      importId
    }
  });

export const normalizeImport = async (
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
      mappingTemplateVersion: true
    }
  });

  if (!importRecord) {
    throw new NotFoundError("Import not found.");
  }

  if (isImportErrorStatus(importRecord.parseStatus)) {
    throw new ValidationError("This import failed validation. Re-upload the file.");
  }

  if (importRecord.parseStatus === "UPLOADED" || importRecord.parseStatus === "PARSING") {
    throw new ValidationError("Parse the import before normalization.");
  }

  if (!importRecord.mappingTemplateVersion) {
    throw new ValidationError("Mapping template is required before normalization.");
  }

  const template = importRecord.mappingTemplateVersion;

  const { rows } = await withRetry(
    () =>
      readImportFile(importRecord, {
        sheetName: template.sheetName ?? null
      }),
    {
      event: "IMPORT_NORMALIZE_READ",
      context: {
        firmId: context.firmId,
        importId: importRecord.id
      },
      shouldRetry: (error) => !(error instanceof ValidationError)
    }
  );

  const normalized = buildNormalizedRows({
    sourceType: importRecord.sourceType,
    rows,
    headerRowIndex: template.headerRowIndex ?? 0,
    columnMap: template.columnMap as ColumnMap,
    normalizationRules: (template.normalizationRules as Record<string, unknown> | null) ??
      null
  });

  const dataset = await prisma.normalizedDataset.upsert({
    where: {
      importId: importRecord.id
    },
    create: {
      firmId: context.firmId,
      importId: importRecord.id,
      sourceType: importRecord.sourceType,
      mappingTemplateVersionId: importRecord.mappingTemplateVersionId ?? null,
      normalizationVersion: NORMALIZATION_VERSION,
      headerRowIndex: normalized.headerRowIndex,
      headerRow: normalized.headerRow,
      rowCount: normalized.rowCount,
      rows: normalized.rows
    },
    update: {
      mappingTemplateVersionId: importRecord.mappingTemplateVersionId ?? null,
      normalizationVersion: NORMALIZATION_VERSION,
      headerRowIndex: normalized.headerRowIndex,
      headerRow: normalized.headerRow,
      rowCount: normalized.rowCount,
      rows: normalized.rows
    }
  });

  const parseSummary =
    importRecord.parseSummary && typeof importRecord.parseSummary === "object"
      ? {
          ...(importRecord.parseSummary as Record<string, unknown>),
          normalizedRowCount: normalized.rows.length,
          normalizationVersion: NORMALIZATION_VERSION
        }
      : {
          normalizedRowCount: normalized.rows.length,
          normalizationVersion: NORMALIZATION_VERSION
        };

  const shouldRecordReady = importRecord.parseStatus !== "READY";
  assertImportTransition(importRecord.parseStatus, "READY");
  await prisma.import.update({
    where: { id: importRecord.id },
    data: {
      parseStatus: "READY",
      parseSummary,
      errorCode: null,
      errorMessage: null
    }
  });

  if (shouldRecordReady) {
    await recordAuditEvent(
      {
        action: "IMPORT_READY",
        entityType: "IMPORT",
        entityId: importRecord.id,
        metadata: {
          sourceType: importRecord.sourceType,
          version: importRecord.version
        }
      },
      {
        firmId: context.firmId,
        actorUserId: context.userId
      }
    );
  }

  return dataset;
};

export const queueImportNormalization = async (
  context: ActorContext,
  importId: string
): Promise<Job | null> => {
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

  if (isImportErrorStatus(importRecord.parseStatus)) {
    throw new ValidationError("This import failed validation. Re-upload the file.");
  }

  if (importRecord.parseStatus === "UPLOADED" || importRecord.parseStatus === "PARSING") {
    throw new ValidationError("Parse the import before normalization.");
  }

  if (!importRecord.mappingTemplateVersionId) {
    throw new ValidationError("Mapping template is required before normalization.");
  }

  if (importRecord.parseStatus === "READY") {
    return null;
  }

  const job = await enqueueJob({
    firmId: context.firmId,
    type: "IMPORT_NORMALIZE",
    payload: {
      firmId: context.firmId,
      importId: importRecord.id,
      actorUserId: context.userId,
      actorRole: context.role
    },
    payRunId: importRecord.payRunId,
    importId: importRecord.id,
    maxAttempts: 2
  });

  if (process.env.JOBS_INLINE === "true") {
    await runJobInline(job);
  }

  return job;
};
