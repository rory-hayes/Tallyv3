import { describe, expect, it } from "vitest";
import type { ImportStatus } from "@/lib/prisma";
import { assertImportTransition, isImportErrorStatus } from "@/lib/import-status";

describe("import status helpers", () => {
  it("identifies error statuses", () => {
    expect(isImportErrorStatus("ERROR_FILE_INVALID")).toBe(true);
    expect(isImportErrorStatus("ERROR_PARSE_FAILED")).toBe(true);
    expect(isImportErrorStatus("PARSED")).toBe(false);
  });

  it("allows idempotent transitions", () => {
    expect(() => assertImportTransition("PARSED", "PARSED")).not.toThrow();
  });

  it("allows valid transitions", () => {
    expect(() => assertImportTransition("UPLOADED", "PARSING")).not.toThrow();
    expect(() => assertImportTransition("PARSING", "PARSED")).not.toThrow();
    expect(() => assertImportTransition("PARSED", "READY")).not.toThrow();
  });

  it("rejects invalid transitions", () => {
    expect(() => assertImportTransition("READY", "PARSING")).toThrow(
      "Import cannot move from READY to PARSING."
    );
  });

  it("rejects unknown statuses", () => {
    expect(() =>
      assertImportTransition("UNKNOWN" as ImportStatus, "READY")
    ).toThrow("Import cannot move from UNKNOWN to READY.");
  });
});
