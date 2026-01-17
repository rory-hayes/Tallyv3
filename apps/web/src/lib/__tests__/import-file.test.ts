import { afterEach, describe, expect, it, vi } from "vitest";
import { Readable } from "stream";
import * as XLSX from "xlsx";
import { readImportFile } from "@/lib/import-file";
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
});
