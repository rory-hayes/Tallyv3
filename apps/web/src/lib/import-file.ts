import "server-only";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "stream";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { ValidationError } from "./errors";
import { storageBucket, storageClient } from "./storage";

export type ImportFileData = {
  rows: string[][];
  sheetNames: string[];
  sheetName: string | null;
};

type ImportFileRecord = {
  storageUri: string;
  originalFilename: string;
};

type ImportFileOptions = {
  sheetName?: string | null;
  maxRows?: number;
};

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
};

const bodyToBuffer = async (body: unknown): Promise<Buffer> => {
  if (!body) {
    throw new ValidationError("File contents are unavailable.");
  }
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof body === "string") {
    return Buffer.from(body);
  }
  if (typeof (body as Readable).pipe === "function") {
    return streamToBuffer(body as Readable);
  }
  throw new ValidationError("Unable to read the uploaded file.");
};

const parseStorageUri = (storageUri: string) => {
  if (!storageUri.startsWith("s3://")) {
    throw new ValidationError("Invalid storage location for this import.");
  }
  const withoutScheme = storageUri.slice("s3://".length);
  const [bucket, ...rest] = withoutScheme.split("/");
  return { bucket, key: rest.join("/") };
};

const normalizeRows = (rows: unknown[][]): string[][] =>
  rows.map((row) =>
    row.map((value) => {
      if (value === null || value === undefined) {
        return "";
      }
      return String(value);
    })
  );

export const readImportFile = async (
  importRecord: ImportFileRecord,
  options: ImportFileOptions = {}
): Promise<ImportFileData> => {
  const { bucket, key } = parseStorageUri(importRecord.storageUri);
  if (bucket !== storageBucket) {
    throw new ValidationError("Import storage location does not match this workspace.");
  }

  const object = await storageClient.send(
    new GetObjectCommand({
      Bucket: storageBucket,
      Key: key
    })
  );

  const buffer = await bodyToBuffer(object.Body);
  const lowerName = importRecord.originalFilename.toLowerCase();
  const { sheetName, maxRows } = options;

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetNames = workbook.SheetNames;
    if (sheetNames.length === 0) {
      throw new ValidationError("No worksheets were found in this file.");
    }
    const activeSheet =
      sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0];
    if (!activeSheet) {
      throw new ValidationError("No worksheets were found in this file.");
    }
    const sheet = workbook.Sheets[activeSheet];
    if (!sheet) {
      throw new ValidationError("Selected worksheet is unavailable.");
    }
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
      defval: ""
    }) as unknown[][];
    const limitedRows = maxRows ? rows.slice(0, maxRows) : rows;

    return {
      rows: normalizeRows(limitedRows),
      sheetNames,
      sheetName: activeSheet
    };
  }

  const text = buffer.toString("utf8");
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    preview: maxRows,
    delimiter: ""
  });

  if (parsed.errors.length > 0) {
    throw new ValidationError("Unable to parse the uploaded CSV file.");
  }

  return {
    rows: normalizeRows(parsed.data as unknown[][]),
    sheetNames: [],
    sheetName: null
  };
};
