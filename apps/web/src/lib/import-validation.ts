import "server-only";

import Papa from "papaparse";
import * as XLSX from "xlsx";
import { ValidationError } from "./errors";
import { env } from "./env";

export type ImportFileKind = "CSV" | "XLSX";

type ImportValidationResult = {
  kind: ImportFileKind;
  rowCount: number;
  columnCount: number;
  sheetNames?: string[];
};

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_ROWS = 50_000;
const DEFAULT_MAX_COLUMNS = 200;

const MAX_BYTES = env.IMPORT_MAX_BYTES ?? DEFAULT_MAX_BYTES;
const MAX_ROWS = env.IMPORT_MAX_ROWS ?? DEFAULT_MAX_ROWS;
const MAX_COLUMNS = env.IMPORT_MAX_COLUMNS ?? DEFAULT_MAX_COLUMNS;

const ZIP_MAGIC = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08])
];
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
const PDF_MAGIC = Buffer.from("%PDF-");

export const formatBytes = (value: number): string => {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileExtension = (fileName: string): string => {
  const lower = fileName.toLowerCase();
  const dotIndex = lower.lastIndexOf(".");
  return dotIndex >= 0 ? lower.slice(dotIndex) : "";
};

const detectFileKind = (fileName: string, mimeType?: string): ImportFileKind => {
  const extension = getFileExtension(fileName);
  if (extension === ".csv") {
    return "CSV";
  }
  if (extension === ".xlsx") {
    return "XLSX";
  }
  if (extension === ".xls") {
    throw new ValidationError(
      "Legacy .xls files are not supported. Export as CSV or XLSX."
    );
  }
  if (mimeType === "text/csv") {
    return "CSV";
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "XLSX";
  }
  if (mimeType === "application/vnd.ms-excel") {
    throw new ValidationError(
      "Unsupported Excel format. Export the file as CSV or XLSX."
    );
  }
  throw new ValidationError("Unsupported file type. Upload CSV or XLSX.");
};

const assertMaxSize = (sizeBytes: number) => {
  if (sizeBytes > MAX_BYTES) {
    throw new ValidationError(
      `File exceeds the ${formatBytes(MAX_BYTES)} limit.`
    );
  }
};

const assertZipSignature = (buffer: Buffer) => {
  const head = buffer.subarray(0, 4);
  const isZip = ZIP_MAGIC.some((magic) => head.equals(magic));
  if (!isZip) {
    throw new ValidationError(
      "Invalid Excel file. The file signature does not match XLSX."
    );
  }
};

const assertWorkbookXmlPresent = (buffer: Buffer) => {
  if (!buffer.includes("xl/workbook.xml")) {
    throw new ValidationError(
      "Invalid Excel file. The workbook definition is missing."
    );
  }
};

const assertTextLike = (buffer: Buffer) => {
  if (buffer.includes(0x00)) {
    throw new ValidationError("Invalid CSV file. The file appears to be binary.");
  }
  const text = buffer.toString("utf8");
  if (text.includes("\uFFFD")) {
    throw new ValidationError(
      "Invalid CSV file. Use UTF-8 encoding and retry."
    );
  }
  return text;
};

const assertRowAndColumnLimits = (rowCount: number, columnCount: number) => {
  if (rowCount === 0) {
    throw new ValidationError("Invalid file. No rows were detected.");
  }
  if (columnCount === 0) {
    throw new ValidationError("Invalid file. No columns were detected.");
  }
  if (rowCount > MAX_ROWS) {
    throw new ValidationError(
      `File exceeds the ${MAX_ROWS.toLocaleString("en-GB")} row limit.`
    );
  }
  if (columnCount > MAX_COLUMNS) {
    throw new ValidationError(
      `File exceeds the ${MAX_COLUMNS.toLocaleString("en-GB")} column limit.`
    );
  }
};

const extractSheetBounds = (workbook: XLSX.WorkBook) => {
  let maxRows = 0;
  let maxCols = 0;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) {
      continue;
    }
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const rows = range.e.r - range.s.r + 1;
    const cols = range.e.c - range.s.c + 1;
    maxRows = Math.max(maxRows, rows);
    maxCols = Math.max(maxCols, cols);
  }
  return { maxRows, maxCols };
};

export const validateImportBuffer = ({
  buffer,
  fileName,
  mimeType,
  sizeBytes
}: {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
}): ImportValidationResult => {
  const actualSize = sizeBytes ?? buffer.length;
  assertMaxSize(actualSize);

  const kind = detectFileKind(fileName, mimeType);

  if (kind === "XLSX") {
    assertZipSignature(buffer);
    assertWorkbookXmlPresent(buffer);

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "buffer" });
    } catch (error) {
      throw new ValidationError("Invalid Excel file. Unable to read workbook.");
    }

    if (workbook.SheetNames.length === 0) {
      throw new ValidationError("Invalid Excel file. No worksheets were found.");
    }

    const { maxRows, maxCols } = extractSheetBounds(workbook);
    assertRowAndColumnLimits(maxRows, maxCols);

    return {
      kind,
      rowCount: maxRows,
      columnCount: maxCols,
      sheetNames: workbook.SheetNames
    };
  }

  if (buffer.subarray(0, 4).equals(OLE_MAGIC)) {
    throw new ValidationError(
      "Legacy .xls files are not supported. Export as CSV or XLSX."
    );
  }
  if (buffer.subarray(0, 5).equals(PDF_MAGIC)) {
    throw new ValidationError(
      "Invalid CSV file. PDF detected; export as CSV or XLSX."
    );
  }
  if (ZIP_MAGIC.some((magic) => buffer.subarray(0, 4).equals(magic))) {
    throw new ValidationError("Invalid CSV file. The file appears to be zipped.");
  }

  const text = assertTextLike(buffer);
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    throw new ValidationError("Invalid CSV file. Unable to parse the file.");
  }
  const rows = parsed.data as unknown[][];
  const rowCount = rows.length;
  const columnCount = rows.reduce(
    (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
    0
  );

  assertRowAndColumnLimits(rowCount, columnCount);

  return {
    kind,
    rowCount,
    columnCount
  };
};

export const importValidationLimits = {
  maxBytes: MAX_BYTES,
  maxRows: MAX_ROWS,
  maxColumns: MAX_COLUMNS
};
