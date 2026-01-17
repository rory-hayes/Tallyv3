import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logError, logInfo, startSpan, withRetry } from "@/lib/logger";

describe("logger", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn> | null = null;
  let stderrSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    const stdout = vi.spyOn(
      process.stdout as unknown as { write: (...args: unknown[]) => boolean },
      "write"
    );
    stdout.mockImplementation(() => true);
    stdoutSpy = stdout as unknown as ReturnType<typeof vi.spyOn>;

    const stderr = vi.spyOn(
      process.stderr as unknown as { write: (...args: unknown[]) => boolean },
      "write"
    );
    stderr.mockImplementation(() => true);
    stderrSpy = stderr as unknown as ReturnType<typeof vi.spyOn>;
  });

  afterEach(() => {
    stdoutSpy?.mockRestore();
    stderrSpy?.mockRestore();
  });

  it("writes structured logs and filters context keys", () => {
    logInfo("TEST_EVENT", {
      firmId: "firm-1",
      payRunId: "payrun-1",
      status: "OK",
      attempt: 2,
      // @ts-expect-error - unknown context fields are intentionally ignored.
      extra: "ignored"
    });

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(stdoutSpy?.mock.calls[0]?.[0]));
    expect(payload.event).toBe("TEST_EVENT");
    expect(payload.firmId).toBe("firm-1");
    expect(payload.payRunId).toBe("payrun-1");
    expect(payload.status).toBe("OK");
    expect(payload.attempt).toBe(2);
    expect(payload.extra).toBeUndefined();
  });

  it("handles empty context payloads", () => {
    logInfo("EMPTY_CONTEXT");
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(stdoutSpy?.mock.calls[0]?.[0]));
    expect(payload.event).toBe("EMPTY_CONTEXT");
  });

  it("logs spans with duration and status", () => {
    const span = startSpan("RECONCILIATION_RUN", { firmId: "firm-1" });
    span.end({ status: "SUCCESS" });

    expect(stdoutSpy).toHaveBeenCalledTimes(2);
    const startPayload = JSON.parse(String(stdoutSpy?.mock.calls[0]?.[0]));
    const endPayload = JSON.parse(String(stdoutSpy?.mock.calls[1]?.[0]));

    expect(startPayload.event).toBe("RECONCILIATION_RUN_STARTED");
    expect(endPayload.event).toBe("RECONCILIATION_RUN_COMPLETED");
    expect(endPayload.status).toBe("SUCCESS");
    expect(typeof endPayload.durationMs).toBe("number");
  });

  it("defaults error names for non-error failures", () => {
    const span = startSpan("UPLOAD", { firmId: "firm-1" });
    span.fail("boom");
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(stderrSpy?.mock.calls[0]?.[0]));
    expect(payload.errorName).toBe("Error");
  });

  it("logs errors to stderr", () => {
    logError("TEST_ERROR", { firmId: "firm-1", errorName: "ValidationError" });
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(stderrSpy?.mock.calls[0]?.[0]));
    expect(payload.event).toBe("TEST_ERROR");
    expect(payload.errorName).toBe("ValidationError");
  });

  it("retries operations and surfaces failures", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 2) {
          throw new Error("fail");
        }
        return "ok";
      },
      {
        attempts: 2,
        delayMs: 1,
        event: "UPLOAD",
        context: { firmId: "firm-1" }
      }
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it("throws after exhausting retry attempts", async () => {
    await expect(
      withRetry(
        async () => {
          throw new Error("always fails");
        },
        { attempts: 1, delayMs: 0, event: "UPLOAD", context: { firmId: "firm-1" } }
      )
    ).rejects.toBeInstanceOf(Error);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
  });
});
