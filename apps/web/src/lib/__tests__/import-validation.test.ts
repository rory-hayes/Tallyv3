import { describe, expect, it, vi } from "vitest";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  formatBytes,
  importValidationLimits,
  validateImportBuffer
} from "@/lib/import-validation";
import {
  ImportFileInvalidError,
  ImportParseError
} from "@/lib/errors";

describe("import validation", () => {
  it("formats bytes consistently", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("validates CSV and returns bounds", () => {
    const buffer = Buffer.from("Name,Value\nA,1\nB,2\n", "utf8");

    const result = validateImportBuffer({
      buffer,
      fileName: "report.csv",
      mimeType: "text/csv"
    });

    expect(result.kind).toBe("CSV");
    expect(result.rowCount).toBe(3);
    expect(result.columnCount).toBe(2);
  });

  it("accepts CSV by mime type without an extension", () => {
    const buffer = Buffer.from("Name,Value\nA,1\n", "utf8");

    const result = validateImportBuffer({
      buffer,
      fileName: "upload",
      mimeType: "text/csv"
    });

    expect(result.kind).toBe("CSV");
  });

  it("rejects empty CSV files", () => {
    const buffer = Buffer.from("", "utf8");

    expect(() =>
      validateImportBuffer({
        buffer,
        fileName: "empty.csv",
        mimeType: "text/csv"
      })
    ).toThrowError(
      new ImportParseError("Invalid file. No rows were detected.")
    );
  });

  it("rejects binary CSV payloads", () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02]);

    expect(() =>
      validateImportBuffer({
        buffer,
        fileName: "binary.csv",
        mimeType: "text/csv"
      })
    ).toThrowError(
      new ImportFileInvalidError("Invalid CSV file. The file appears to be binary.")
    );
  });

  it("rejects CSV files with invalid encoding", () => {
    const buffer = Buffer.from([0xff, 0xfe, 0xfd]);

    expect(() =>
      validateImportBuffer({
        buffer,
        fileName: "encoded.csv",
        mimeType: "text/csv"
      })
    ).toThrowError(
      new ImportFileInvalidError("Invalid CSV file. Use UTF-8 encoding and retry.")
    );
  });

  it("rejects PDF masquerading as CSV", () => {
    const buffer = Buffer.from("%PDF-1.7", "utf8");

    expect(() =>
      validateImportBuffer({
        buffer,
        fileName: "statement.csv",
        mimeType: "text/csv"
      })
    ).toThrowError(
      new ImportFileInvalidError(
        "Invalid CSV file. PDF detected; export as CSV or XLSX."
      )
    );
  });

  it("rejects zipped CSV payloads", () => {
    const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);

    expect(() =>
      validateImportBuffer({
        buffer,
        fileName: "archive.csv",
        mimeType: "text/csv"
      })
    ).toThrowError(
      new ImportFileInvalidError("Invalid CSV file. The file appears to be zipped.")
    );
  });

  it("rejects unsupported file types", () => {
    const buffer = Buffer.from("Name,Value\nA,1\n", "utf8");

    expect(() =>
      validateImportBuffer({
        buffer,
        fileName: "notes.txt",
        mimeType: "text/plain"
      })
    ).toThrowError(
      new ImportFileInvalidError("Unsupported file type. Upload CSV or XLSX.")
    );
  });

  it("rejects legacy .xls signatures", () => {
    const buffer = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00]);

    expect(() =>
      validateImportBuffer({
        buffer,
        fileName: "legacy.csv",
        mimeType: "text/csv"
      })
    ).toThrowError(
      new ImportFileInvalidError(
        "Legacy .xls files are not supported. Export as CSV or XLSX."
      )
    );
  });

  it("rejects legacy .xls extensions", () => {
    const buffer = Buffer.from("Name,Value\nA,1\n", "utf8");

    expect(() =>
      validateImportBuffer({
        buffer,
        fileName: "legacy.xls",
        mimeType: "application/vnd.ms-excel"
      })
    ).toThrowError(
      new ImportFileInvalidError(
        "Legacy .xls files are not supported. Export as CSV or XLSX."
      )
    );
  });

  it("rejects unsupported Excel mime types", () => {
    const buffer = Buffer.from("Name,Value\nA,1\n", "utf8");

    expect(() =>
      validateImportBuffer({
        buffer,
        fileName: "legacy.dat",
        mimeType: "application/vnd.ms-excel"
      })
    ).toThrowError(
      new ImportFileInvalidError(
        "Unsupported Excel format. Export the file as CSV or XLSX."
      )
    );
  });

  it("accepts XLSX by mime type without an extension", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Name", "Value"],
      ["A", 1]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const result = validateImportBuffer({
      buffer,
      fileName: "upload",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    expect(result.kind).toBe("XLSX");
  });

  it("validates XLSX workbooks and returns sheet bounds", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Name", "Value"],
      ["A", 1]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const result = validateImportBuffer({
      buffer,
      fileName: "report.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    expect(result.kind).toBe("XLSX");
    expect(result.rowCount).toBe(2);
    expect(result.columnCount).toBe(2);
    expect(result.sheetNames).toEqual(["Sheet1"]);
  });

  it("rejects XLSX buffers with invalid signatures", () => {
    const buffer = Buffer.from("not-a-zip", "utf8");

    expect(() =>
      validateImportBuffer({
        buffer,
        fileName: "bad.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      })
    ).toThrowError(
      new ImportFileInvalidError(
        "Invalid Excel file. The file signature does not match XLSX."
      )
    );
  });

  it("rejects XLSX buffers missing a workbook definition", () => {
    const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);

    expect(() =>
      validateImportBuffer({
        buffer,
        fileName: "broken.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      })
    ).toThrowError(
      new ImportFileInvalidError(
        "Invalid Excel file. The workbook definition is missing."
      )
    );
  });

  it("rejects XLSX buffers that cannot be read", () => {
    const buffer = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from("xl/workbook.xml", "utf8")
    ]);

    expect(() =>
      validateImportBuffer({
        buffer,
        fileName: "unreadable.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      })
    ).toThrowError(
      new ImportParseError("Invalid Excel file. Unable to read workbook.")
    );
  });

  it("rejects XLSX workbooks without worksheets", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["Name", "Value"]]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const readSpy = vi
      .spyOn(XLSX, "read")
      .mockReturnValue({ SheetNames: [], Sheets: {} } as XLSX.WorkBook);

    try {
      expect(() =>
        validateImportBuffer({
          buffer,
          fileName: "empty.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        })
      ).toThrowError(
        new ImportParseError("Invalid Excel file. No worksheets were found.")
      );
    } finally {
      readSpy.mockRestore();
    }
  });

  it("rejects files over the size limit", () => {
    const buffer = Buffer.from("Name,Value\nA,1\n", "utf8");

    expect(() =>
      validateImportBuffer({
        buffer,
        fileName: "large.csv",
        mimeType: "text/csv",
        sizeBytes: importValidationLimits.maxBytes + 1
      })
    ).toThrowError(
      new ImportFileInvalidError(
        `File exceeds the ${formatBytes(importValidationLimits.maxBytes)} limit.`
      )
    );
  });

  it("rejects CSV files with no rows", () => {
    const parseResult: Papa.ParseResult<string[]> = {
      data: [],
      errors: [],
      meta: {
        delimiter: ",",
        linebreak: "\n",
        aborted: false,
        truncated: false,
        cursor: 0
      }
    };
    const parseSpy = vi
      .spyOn(Papa, "parse")
      .mockReturnValue(parseResult as unknown as ReturnType<typeof Papa.parse>);

    expect(() =>
      validateImportBuffer({
        buffer: Buffer.from("Name,Value\n", "utf8"),
        fileName: "empty-rows.csv",
        mimeType: "text/csv"
      })
    ).toThrowError(new ImportParseError("Invalid file. No rows were detected."));

    parseSpy.mockRestore();
  });

  it("rejects CSV files with no columns", () => {
    const parseResult: Papa.ParseResult<string[]> = {
      data: [[]],
      errors: [],
      meta: {
        delimiter: ",",
        linebreak: "\n",
        aborted: false,
        truncated: false,
        cursor: 0
      }
    };
    const parseSpy = vi
      .spyOn(Papa, "parse")
      .mockReturnValue(parseResult as unknown as ReturnType<typeof Papa.parse>);

    expect(() =>
      validateImportBuffer({
        buffer: Buffer.from("Name,Value\n", "utf8"),
        fileName: "empty-cols.csv",
        mimeType: "text/csv"
      })
    ).toThrowError(
      new ImportParseError("Invalid file. No columns were detected.")
    );

    parseSpy.mockRestore();
  });
});
