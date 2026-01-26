import { describe, expect, it, vi, beforeEach } from "vitest";

const logError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger", () => ({
  logError
}));

import { logServerError } from "@/lib/server-errors";

describe("logServerError", () => {
  beforeEach(() => {
    logError.mockReset();
  });

  it("logs the error name and code when available", () => {
    const error = Object.assign(new Error("Failure"), { code: "E123" });

    logServerError({ scope: "pack download" }, error);

    expect(logError).toHaveBeenCalledWith("SERVER_ERROR_PACK_DOWNLOAD", {
      errorName: "Error",
      errorCode: "E123"
    });
  });

  it("falls back to meta code for non-error inputs", () => {
    logServerError({ scope: "import_upload", code: "FALLBACK" }, "oops");

    expect(logError).toHaveBeenCalledWith("SERVER_ERROR_IMPORT_UPLOAD", {
      errorName: "UnknownError",
      errorCode: "FALLBACK"
    });
  });
});
