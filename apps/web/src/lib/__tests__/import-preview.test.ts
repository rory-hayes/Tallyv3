import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "stream";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/clients";
import { createPayRun } from "@/lib/pay-runs";
import { getImportPreview } from "@/lib/import-preview";
import * as importFile from "@/lib/import-file";
import { storageBucket, storageClient } from "@/lib/storage";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createFirmWithUser, resetDb } from "./test-db";

describe("import preview", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a CSV preview", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Preview Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-06-01T00:00:00Z"),
        periodEnd: new Date("2026-06-30T00:00:00Z")
      }
    );
    const importRecord = await prisma.import.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: `s3://${storageBucket}/uploads/file.csv`,
        fileHashSha256: "hash-preview",
        originalFilename: "file.csv",
        mimeType: "text/csv",
        sizeBytes: 120,
        uploadedByUserId: user.id,
        parseStatus: "UPLOADED"
      }
    });

    vi.spyOn(
      storageClient as unknown as { send: () => Promise<unknown> },
      "send"
    ).mockResolvedValue({
      Body: Buffer.from("Name,Net\nAlex,120\n")
    } as { Body: unknown });

    const preview = await getImportPreview(firm.id, importRecord.id, null);
    expect(preview.rows[0]).toEqual(["Name", "Net"]);
    expect(preview.sheetNames).toEqual([]);

    const updated = await prisma.import.findUnique({
      where: { id: importRecord.id }
    });
    expect(updated?.parseStatus).toBe("PARSED");
    expect(updated?.parseSummary).toEqual(
      expect.objectContaining({
        rowCount: 2,
        columnCount: 2
      })
    );
  });

  it("rejects preview for imports in error status", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Preview Client Error",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-08-01T00:00:00Z"),
        periodEnd: new Date("2026-08-31T00:00:00Z")
      }
    );
    const importRecord = await prisma.import.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: `s3://${storageBucket}/uploads/file-error.csv`,
        fileHashSha256: "hash-preview-error",
        originalFilename: "file-error.csv",
        mimeType: "text/csv",
        sizeBytes: 120,
        uploadedByUserId: user.id,
        parseStatus: "ERROR_PARSE_FAILED",
        errorCode: "ERROR_PARSE_FAILED",
        errorMessage: "Failed to parse."
      }
    });

    await expect(
      getImportPreview(firm.id, importRecord.id, null)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("keeps parse status when already mapped", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Preview Client Mapped",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-06-01T00:00:00Z"),
        periodEnd: new Date("2026-06-30T00:00:00Z")
      }
    );
    const importRecord = await prisma.import.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: `s3://${storageBucket}/uploads/file-mapped.csv`,
        fileHashSha256: "hash-preview-mapped",
        originalFilename: "file-mapped.csv",
        mimeType: "text/csv",
        sizeBytes: 120,
        uploadedByUserId: user.id,
        parseStatus: "READY"
      }
    });

    vi.spyOn(
      storageClient as unknown as { send: () => Promise<unknown> },
      "send"
    ).mockResolvedValue({
      Body: Buffer.from("Name,Net\nAlex,120\n")
    } as { Body: unknown });

    const preview = await getImportPreview(firm.id, importRecord.id, null);
    expect(preview.rows[0]).toEqual(["Name", "Net"]);

    const updated = await prisma.import.findUnique({
      where: { id: importRecord.id }
    });
    expect(updated?.parseStatus).toBe("READY");
    expect(updated?.parseSummary).toEqual(
      expect.objectContaining({
        rowCount: 2,
        columnCount: 2
      })
    );
  });

  it("returns an XLSX preview", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Employee", "Net"],
      ["Alex", "120"]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Preview Client XLSX",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-07-01T00:00:00Z"),
        periodEnd: new Date("2026-07-31T00:00:00Z")
      }
    );
    const importRecord = await prisma.import.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: `s3://${storageBucket}/uploads/file.xlsx`,
        fileHashSha256: "hash-preview-xlsx",
        originalFilename: "file.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 220,
        uploadedByUserId: user.id,
        parseStatus: "UPLOADED"
      }
    });

    vi.spyOn(
      storageClient as unknown as { send: () => Promise<unknown> },
      "send"
    ).mockResolvedValue({
      Body: Buffer.from(buffer)
    } as { Body: unknown });

    const preview = await getImportPreview(firm.id, importRecord.id, null);
    expect(preview.rows[0]).toEqual(["Employee", "Net"]);
    expect(preview.sheetNames).toContain("Sheet1");

    const updated = await prisma.import.findUnique({
      where: { id: importRecord.id }
    });
    expect(updated?.parseStatus).toBe("PARSED");
  });

  it("throws for missing imports", async () => {
    const { firm } = await createFirmWithUser("ADMIN");
    const missingId = "9f1b7f4c-5e44-4e26-90f7-3a42e0f5d999";
    await expect(
      getImportPreview(firm.id, missingId, null)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws for invalid storage uri", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Preview Client Invalid",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-08-01T00:00:00Z"),
        periodEnd: new Date("2026-08-31T00:00:00Z")
      }
    );
    const importRecord = await prisma.import.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: "https://example.com/file.csv",
        fileHashSha256: "hash-preview-bad",
        originalFilename: "file.csv",
        mimeType: "text/csv",
        sizeBytes: 120,
        uploadedByUserId: user.id,
        parseStatus: "UPLOADED"
      }
    });

    await expect(
      getImportPreview(firm.id, importRecord.id, null)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects bucket mismatches", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Preview Client Bucket",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-09-01T00:00:00Z"),
        periodEnd: new Date("2026-09-30T00:00:00Z")
      }
    );
    const importRecord = await prisma.import.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: "s3://other-bucket/uploads/file.csv",
        fileHashSha256: "hash-preview-bucket",
        originalFilename: "file.csv",
        mimeType: "text/csv",
        sizeBytes: 120,
        uploadedByUserId: user.id,
        parseStatus: "UPLOADED"
      }
    });

    await expect(
      getImportPreview(firm.id, importRecord.id, null)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("records unknown parsing errors", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Preview Client Unknown Error",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-10-01T00:00:00Z"),
        periodEnd: new Date("2026-10-31T00:00:00Z")
      }
    );
    const importRecord = await prisma.import.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: `s3://${storageBucket}/uploads/file-unknown.csv`,
        fileHashSha256: "hash-preview-unknown",
        originalFilename: "file-unknown.csv",
        mimeType: "text/csv",
        sizeBytes: 120,
        uploadedByUserId: user.id,
        parseStatus: "UPLOADED"
      }
    });

    vi.spyOn(importFile, "readImportFile").mockRejectedValue("boom");

    await expect(
      getImportPreview(firm.id, importRecord.id, null)
    ).rejects.toBe("boom");

    const updated = await prisma.import.findUnique({
      where: { id: importRecord.id }
    });
    expect(updated?.parseStatus).toBe("ERROR_PARSE_FAILED");
    expect(updated?.parseSummary).toEqual({ error: "Unable to parse file." });
  });

  it("rejects empty file bodies", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Preview Client Empty",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-10-01T00:00:00Z"),
        periodEnd: new Date("2026-10-31T00:00:00Z")
      }
    );
    const importRecord = await prisma.import.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: `s3://${storageBucket}/uploads/empty.csv`,
        fileHashSha256: "hash-preview-empty",
        originalFilename: "empty.csv",
        mimeType: "text/csv",
        sizeBytes: 10,
        uploadedByUserId: user.id,
        parseStatus: "UPLOADED"
      }
    });

    vi.spyOn(
      storageClient as unknown as { send: () => Promise<unknown> },
      "send"
    ).mockResolvedValue({ Body: null } as { Body: unknown });

    await expect(
      getImportPreview(firm.id, importRecord.id, null)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects invalid worksheets", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Preview Client Sheet",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-11-01T00:00:00Z"),
        periodEnd: new Date("2026-11-30T00:00:00Z")
      }
    );
    const importRecord = await prisma.import.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: `s3://${storageBucket}/uploads/bad.xlsx`,
        fileHashSha256: "hash-preview-sheet",
        originalFilename: "bad.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 120,
        uploadedByUserId: user.id,
        parseStatus: "UPLOADED"
      }
    });

    const validXlsxHeader = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from("xl/workbook.xml")
    ]);

    vi.spyOn(
      storageClient as unknown as { send: () => Promise<unknown> },
      "send"
    ).mockResolvedValue({
      Body: validXlsxHeader
    } as { Body: unknown });

    const readSpy = vi.spyOn(XLSX, "read").mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: {}
    } as XLSX.WorkBook);

    await expect(
      getImportPreview(firm.id, importRecord.id, null)
    ).rejects.toBeInstanceOf(ValidationError);

    const updated = await prisma.import.findUnique({
      where: { id: importRecord.id }
    });
    expect(updated?.parseStatus).toBe("ERROR_PARSE_FAILED");

    readSpy.mockRestore();
  });

  it("rejects XLSX files with no worksheets", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Preview Client Empty Sheet",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2027-01-01T00:00:00Z"),
        periodEnd: new Date("2027-01-31T00:00:00Z")
      }
    );
    const importRecord = await prisma.import.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: `s3://${storageBucket}/uploads/empty.xlsx`,
        fileHashSha256: "hash-preview-empty-sheet",
        originalFilename: "empty.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 120,
        uploadedByUserId: user.id,
        parseStatus: "UPLOADED"
      }
    });

    const validXlsxHeader = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from("xl/workbook.xml")
    ]);

    vi.spyOn(
      storageClient as unknown as { send: () => Promise<unknown> },
      "send"
    ).mockResolvedValue({
      Body: validXlsxHeader
    } as { Body: unknown });

    const readSpy = vi.spyOn(XLSX, "read").mockReturnValue({
      SheetNames: [],
      Sheets: {}
    } as XLSX.WorkBook);

    await expect(
      getImportPreview(firm.id, importRecord.id, null)
    ).rejects.toBeInstanceOf(ValidationError);

    const updated = await prisma.import.findUnique({
      where: { id: importRecord.id }
    });
    expect(updated?.parseStatus).toBe("ERROR_PARSE_FAILED");

    readSpy.mockRestore();
  });

  it("rejects XLSX files with blank active sheets", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Preview Client Blank Sheet",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2027-02-01T00:00:00Z"),
        periodEnd: new Date("2027-02-28T00:00:00Z")
      }
    );
    const importRecord = await prisma.import.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: `s3://${storageBucket}/uploads/blank.xlsx`,
        fileHashSha256: "hash-preview-blank-sheet",
        originalFilename: "blank.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 120,
        uploadedByUserId: user.id,
        parseStatus: "UPLOADED"
      }
    });

    vi.spyOn(
      storageClient as unknown as { send: () => Promise<unknown> },
      "send"
    ).mockResolvedValue({
      Body: Buffer.from("fake")
    } as { Body: unknown });

    const readSpy = vi.spyOn(XLSX, "read").mockReturnValue({
      SheetNames: [""],
      Sheets: {}
    } as XLSX.WorkBook);

    await expect(
      getImportPreview(firm.id, importRecord.id, null)
    ).rejects.toBeInstanceOf(ValidationError);

    readSpy.mockRestore();
  });

  it("rejects CSV parse errors", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Preview Client CSV",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-12-01T00:00:00Z"),
        periodEnd: new Date("2026-12-31T00:00:00Z")
      }
    );
    const importRecord = await prisma.import.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: `s3://${storageBucket}/uploads/bad.csv`,
        fileHashSha256: "hash-preview-csv",
        originalFilename: "bad.csv",
        mimeType: "text/csv",
        sizeBytes: 120,
        uploadedByUserId: user.id,
        parseStatus: "UPLOADED"
      }
    });

    vi.spyOn(
      storageClient as unknown as { send: () => Promise<unknown> },
      "send"
    ).mockResolvedValue({
      Body: "not,a,csv"
    } as { Body: unknown });

    const parseSpy = vi.spyOn(Papa, "parse");
    const parseResult = {
      data: [],
      errors: [
        {
          message: "bad csv",
          type: "Delimiter",
          code: "UndetectableDelimiter"
        }
      ],
      meta: {
        delimiter: ",",
        linebreak: "\n",
        aborted: false,
        truncated: false,
        cursor: 0
      }
    } as Papa.ParseResult<string[]>;
    (
      parseSpy as unknown as {
        mockReturnValue: (value: Papa.ParseResult<string[]>) => void;
      }
    ).mockReturnValue(parseResult);

    await expect(
      getImportPreview(firm.id, importRecord.id, null)
    ).rejects.toBeInstanceOf(ValidationError);

    const updated = await prisma.import.findUnique({
      where: { id: importRecord.id }
    });
    expect(updated?.parseStatus).toBe("ERROR_PARSE_FAILED");

    parseSpy.mockRestore();
  });

  it("handles string bodies and normalizes empty values", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Preview Client String",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2027-03-01T00:00:00Z"),
        periodEnd: new Date("2027-03-31T00:00:00Z")
      }
    );
    const importRecord = await prisma.import.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: `s3://${storageBucket}/uploads/string.csv`,
        fileHashSha256: "hash-preview-string",
        originalFilename: "string.csv",
        mimeType: "text/csv",
        sizeBytes: 120,
        uploadedByUserId: user.id,
        parseStatus: "UPLOADED"
      }
    });

    vi.spyOn(
      storageClient as unknown as { send: () => Promise<unknown> },
      "send"
    ).mockResolvedValue({
      Body: "Name,Net\nAlex,120\n"
    } as { Body: unknown });

    const parseSpy = vi.spyOn(Papa, "parse");
    const parseResult = {
      data: [[null, undefined, "Text"]],
      errors: [],
      meta: {
        delimiter: ",",
        linebreak: "\n",
        aborted: false,
        truncated: false,
        cursor: 0
      }
    } as Papa.ParseResult<string[]>;
    (
      parseSpy as unknown as {
        mockReturnValue: (value: Papa.ParseResult<string[]>) => void;
      }
    ).mockReturnValue(parseResult);

    const preview = await getImportPreview(firm.id, importRecord.id, null);
    expect(preview.rows[0]).toEqual(["", "", "Text"]);

    parseSpy.mockRestore();
  });

  it("handles Uint8Array bodies", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Preview Client Uint8",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2027-04-01T00:00:00Z"),
        periodEnd: new Date("2027-04-30T00:00:00Z")
      }
    );
    const importRecord = await prisma.import.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: `s3://${storageBucket}/uploads/uint8.csv`,
        fileHashSha256: "hash-preview-uint8",
        originalFilename: "uint8.csv",
        mimeType: "text/csv",
        sizeBytes: 120,
        uploadedByUserId: user.id,
        parseStatus: "UPLOADED"
      }
    });

    vi.spyOn(
      storageClient as unknown as { send: () => Promise<unknown> },
      "send"
    ).mockResolvedValue({
      Body: Uint8Array.from(Buffer.from("Name,Net\nAlex,120\n", "utf8"))
    } as { Body: unknown });

    const preview = await getImportPreview(firm.id, importRecord.id, null);
    expect(preview.rows[0]).toEqual(["Name", "Net"]);
  });

  it("handles stream bodies", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Preview Client Stream",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2027-05-01T00:00:00Z"),
        periodEnd: new Date("2027-05-31T00:00:00Z")
      }
    );
    const importRecord = await prisma.import.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: `s3://${storageBucket}/uploads/stream.csv`,
        fileHashSha256: "hash-preview-stream",
        originalFilename: "stream.csv",
        mimeType: "text/csv",
        sizeBytes: 120,
        uploadedByUserId: user.id,
        parseStatus: "UPLOADED"
      }
    });

    vi.spyOn(
      storageClient as unknown as { send: () => Promise<unknown> },
      "send"
    ).mockResolvedValue({
      Body: Readable.from(["Name,Net\n", "Alex,120\n"])
    } as { Body: unknown });

    const preview = await getImportPreview(firm.id, importRecord.id, null);
    expect(preview.rows[0]).toEqual(["Name", "Net"]);
  });

  it("rejects unreadable bodies", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Preview Client Unreadable",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2027-06-01T00:00:00Z"),
        periodEnd: new Date("2027-06-30T00:00:00Z")
      }
    );
    const importRecord = await prisma.import.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: `s3://${storageBucket}/uploads/unreadable.csv`,
        fileHashSha256: "hash-preview-unreadable",
        originalFilename: "unreadable.csv",
        mimeType: "text/csv",
        sizeBytes: 120,
        uploadedByUserId: user.id,
        parseStatus: "UPLOADED"
      }
    });

    vi.spyOn(
      storageClient as unknown as { send: () => Promise<unknown> },
      "send"
    ).mockResolvedValue({
      Body: { nope: true }
    } as { Body: unknown });

    await expect(
      getImportPreview(firm.id, importRecord.id, null)
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
