import { afterEach, describe, expect, it, vi } from "vitest";
import { Readable } from "stream";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { readImportFile } from "@/lib/import-file";
import * as importValidation from "@/lib/import-validation";
import { storageBucket, storageClient } from "@/lib/storage";

type StorageCommand = {
  input?: {
    Key?: string;
  };
};

describe("readImportFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects non-s3 storage URIs", async () => {
    await expect(
      readImportFile({
        storageUri: "file:///tmp/import.csv",
        originalFilename: "import.csv"
      })
    ).rejects.toThrow("Invalid storage location for this import.");
  });

  it("rejects imports from a different storage bucket", async () => {
    await expect(
      readImportFile({
        storageUri: "s3://other-bucket/imports/data.csv",
        originalFilename: "data.csv"
      })
    ).rejects.toThrow("Import storage location does not match this workspace.");
  });

  it("reads CSV data from a stream body", async () => {
    const body = Readable.from(["Name,Net\nAlex,120\n"]);
    vi.spyOn(
      storageClient as unknown as { send: (command: StorageCommand) => Promise<unknown> },
      "send"
    ).mockResolvedValue({ Body: body } as { Body: unknown });

    const result = await readImportFile(
      {
        storageUri: `s3://${storageBucket}/imports/stream.csv`,
        originalFilename: "stream.csv"
      },
      {}
    );

    expect(result.rows[0]).toEqual(["Name", "Net"]);
    expect(result.rows[1]).toEqual(["Alex", "120"]);
  });

  it("reads CSV data from string chunks in a stream body", async () => {
    const body = Readable.from(["Name,Net\n", "Alex,120\n"], { objectMode: true });
    vi.spyOn(
      storageClient as unknown as { send: (command: StorageCommand) => Promise<unknown> },
      "send"
    ).mockResolvedValue({ Body: body } as { Body: unknown });

    const result = await readImportFile(
      {
        storageUri: `s3://${storageBucket}/imports/string-stream.csv`,
        originalFilename: "string-stream.csv"
      },
      {}
    );

    expect(result.rows[0]).toEqual(["Name", "Net"]);
    expect(result.rows[1]).toEqual(["Alex", "120"]);
  });

  it("reads CSV data from a string body", async () => {
    vi.spyOn(
      storageClient as unknown as { send: (command: StorageCommand) => Promise<unknown> },
      "send"
    ).mockResolvedValue({ Body: "Name,Net\nAlex,120\n" } as { Body: unknown });

    const result = await readImportFile(
      {
        storageUri: `s3://${storageBucket}/imports/string.csv`,
        originalFilename: "string.csv"
      },
      {}
    );

    expect(result.rows[0]).toEqual(["Name", "Net"]);
    expect(result.rows[1]).toEqual(["Alex", "120"]);
  });

  it("selects the requested worksheet when provided", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet1 = XLSX.utils.aoa_to_sheet([
      ["Header1"],
      ["Row1"]
    ]);
    const sheet2 = XLSX.utils.aoa_to_sheet([
      ["Header2"],
      ["Row2"]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet1, "Sheet1");
    XLSX.utils.book_append_sheet(workbook, sheet2, "Sheet2");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    vi.spyOn(
      storageClient as unknown as { send: (command: StorageCommand) => Promise<unknown> },
      "send"
    ).mockResolvedValue({ Body: Buffer.from(buffer) } as { Body: unknown });

    const result = await readImportFile(
      {
        storageUri: `s3://${storageBucket}/imports/worksheet.xlsx`,
        originalFilename: "worksheet.xlsx"
      },
      {
        sheetName: "Sheet2"
      }
    );

    expect(result.sheetName).toBe("Sheet2");
    expect(result.rows[0]).toEqual(["Header2"]);
    expect(result.rows[1]).toEqual(["Row2"]);
  });

  it("falls back to the first worksheet when the requested one is missing", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet1 = XLSX.utils.aoa_to_sheet([
      ["Header1"],
      ["Row1"]
    ]);
    const sheet2 = XLSX.utils.aoa_to_sheet([
      ["Header2"],
      ["Row2"]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet1, "Sheet1");
    XLSX.utils.book_append_sheet(workbook, sheet2, "Sheet2");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    vi.spyOn(
      storageClient as unknown as { send: (command: StorageCommand) => Promise<unknown> },
      "send"
    ).mockResolvedValue({ Body: Buffer.from(buffer) } as { Body: unknown });

    const result = await readImportFile(
      {
        storageUri: `s3://${storageBucket}/imports/fallback.xlsx`,
        originalFilename: "fallback.xlsx"
      },
      {
        sheetName: "MissingSheet"
      }
    );

    expect(result.sheetName).toBe("Sheet1");
    expect(result.rows[0]).toEqual(["Header1"]);
    expect(result.rows[1]).toEqual(["Row1"]);
  });

  it("raises an error when the active worksheet is unavailable", async () => {
    vi.spyOn(importValidation, "validateImportBuffer").mockReturnValue({
      kind: "XLSX",
      rowCount: 1,
      columnCount: 1,
      sheetNames: ["Sheet1"]
    });
    vi.spyOn(XLSX, "read").mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: {}
    } as XLSX.WorkBook);
    vi.spyOn(
      storageClient as unknown as { send: (command: StorageCommand) => Promise<unknown> },
      "send"
    ).mockResolvedValue({ Body: Buffer.from("placeholder") } as { Body: unknown });

    await expect(
      readImportFile({
        storageUri: `s3://${storageBucket}/imports/missing-sheet.xlsx`,
        originalFilename: "missing-sheet.xlsx"
      })
    ).rejects.toThrow("Selected worksheet is unavailable.");
  });

  it("surfaces CSV parse errors during read", async () => {
    vi.spyOn(importValidation, "validateImportBuffer").mockReturnValue({
      kind: "CSV",
      rowCount: 1,
      columnCount: 1
    });
    vi.spyOn(Papa, "parse").mockImplementation(() => {
      const result: Papa.ParseResult<string[]> = {
        data: [],
        errors: [
          {
            type: "Quotes",
            code: "InvalidQuotes",
            message: "Invalid quotes"
          }
        ],
        meta: {
          delimiter: ",",
          linebreak: "\n",
          aborted: false,
          truncated: false,
          cursor: 0
        }
      };
      return result as unknown as ReturnType<typeof Papa.parse>;
    });
    vi.spyOn(
      storageClient as unknown as { send: (command: StorageCommand) => Promise<unknown> },
      "send"
    ).mockResolvedValue({ Body: "bad,data" } as { Body: unknown });

    await expect(
      readImportFile({
        storageUri: `s3://${storageBucket}/imports/bad.csv`,
        originalFilename: "bad.csv"
      })
    ).rejects.toThrow("Unable to parse the uploaded CSV file.");
  });

  it("rejects legacy xls files", async () => {
    vi.spyOn(importValidation, "validateImportBuffer").mockReturnValue({
      kind: "XLSX",
      rowCount: 1,
      columnCount: 1,
      sheetNames: ["Sheet1"]
    });
    vi.spyOn(
      storageClient as unknown as { send: (command: StorageCommand) => Promise<unknown> },
      "send"
    ).mockResolvedValue({ Body: Buffer.from("placeholder") } as { Body: unknown });

    await expect(
      readImportFile({
        storageUri: `s3://${storageBucket}/imports/legacy.xls`,
        originalFilename: "legacy.xls"
      })
    ).rejects.toThrow("Legacy .xls files are not supported.");
  });

  it("rejects empty worksheet lists", async () => {
    vi.spyOn(importValidation, "validateImportBuffer").mockReturnValue({
      kind: "XLSX",
      rowCount: 1,
      columnCount: 1,
      sheetNames: []
    });
    vi.spyOn(XLSX, "read").mockReturnValue({
      SheetNames: [],
      Sheets: {}
    } as XLSX.WorkBook);
    vi.spyOn(
      storageClient as unknown as { send: (command: StorageCommand) => Promise<unknown> },
      "send"
    ).mockResolvedValue({ Body: Buffer.from("placeholder") } as { Body: unknown });

    await expect(
      readImportFile({
        storageUri: `s3://${storageBucket}/imports/empty.xlsx`,
        originalFilename: "empty.xlsx"
      })
    ).rejects.toThrow("No worksheets were found in this file.");
  });

  it("rejects blank active worksheet names", async () => {
    vi.spyOn(importValidation, "validateImportBuffer").mockReturnValue({
      kind: "XLSX",
      rowCount: 1,
      columnCount: 1,
      sheetNames: [""]
    });
    vi.spyOn(XLSX, "read").mockReturnValue({
      SheetNames: [""],
      Sheets: { "": {} }
    } as XLSX.WorkBook);
    vi.spyOn(
      storageClient as unknown as { send: (command: StorageCommand) => Promise<unknown> },
      "send"
    ).mockResolvedValue({ Body: Buffer.from("placeholder") } as { Body: unknown });

    await expect(
      readImportFile({
        storageUri: `s3://${storageBucket}/imports/blank-sheet.xlsx`,
        originalFilename: "blank-sheet.xlsx"
      })
    ).rejects.toThrow("No worksheets were found in this file.");
  });

  it("rejects missing file bodies", async () => {
    vi.spyOn(
      storageClient as unknown as { send: (command: StorageCommand) => Promise<unknown> },
      "send"
    ).mockResolvedValue({ Body: null } as { Body: unknown });

    await expect(
      readImportFile({
        storageUri: `s3://${storageBucket}/imports/missing.csv`,
        originalFilename: "missing.csv"
      })
    ).rejects.toThrow("File contents are unavailable.");
  });
});
