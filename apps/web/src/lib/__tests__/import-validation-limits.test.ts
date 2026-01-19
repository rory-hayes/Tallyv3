import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = {
  IMPORT_MAX_ROWS: process.env.IMPORT_MAX_ROWS,
  IMPORT_MAX_COLUMNS: process.env.IMPORT_MAX_COLUMNS,
  IMPORT_MAX_BYTES: process.env.IMPORT_MAX_BYTES
};

const restoreEnvValue = (key: keyof typeof originalEnv) => {
  const value = originalEnv[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

const loadValidationWithLimits = async ({
  rows,
  columns,
  bytes
}: {
  rows: number;
  columns: number;
  bytes: number;
}) => {
  process.env.IMPORT_MAX_ROWS = String(rows);
  process.env.IMPORT_MAX_COLUMNS = String(columns);
  process.env.IMPORT_MAX_BYTES = String(bytes);
  vi.resetModules();
  return import("@/lib/import-validation");
};

afterEach(() => {
  restoreEnvValue("IMPORT_MAX_ROWS");
  restoreEnvValue("IMPORT_MAX_COLUMNS");
  restoreEnvValue("IMPORT_MAX_BYTES");
  vi.resetModules();
});

describe("import validation limits", () => {
  it("enforces row limits", async () => {
    const { validateImportBuffer } = await loadValidationWithLimits({
      rows: 1,
      columns: 200,
      bytes: 1024 * 1024
    });

    const buffer = Buffer.from("Name,Value\nA,1\nB,2\n", "utf8");

    expect(() =>
      validateImportBuffer({
        buffer,
        fileName: "rows.csv",
        mimeType: "text/csv"
      })
    ).toThrowError("File exceeds the 1 row limit.");
  });

  it("enforces column limits", async () => {
    const { validateImportBuffer } = await loadValidationWithLimits({
      rows: 50_000,
      columns: 1,
      bytes: 1024 * 1024
    });

    const buffer = Buffer.from("A,B\n1,2\n", "utf8");

    expect(() =>
      validateImportBuffer({
        buffer,
        fileName: "cols.csv",
        mimeType: "text/csv"
      })
    ).toThrowError("File exceeds the 1 column limit.");
  });
});
