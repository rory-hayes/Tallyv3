import { describe, expect, it } from "vitest";
import {
  assertReasonablePeriod,
  formatPeriodLabel,
  parseDateInput
} from "@/lib/pay-run-utils";
import { ValidationError } from "@/lib/errors";

describe("pay run utils", () => {
  it("parses date input in YYYY-MM-DD", () => {
    const date = parseDateInput("2026-01-15");
    expect(date.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("rejects missing date input", () => {
    expect(() => parseDateInput("")).toThrow(ValidationError);
  });

  it("rejects invalid date input", () => {
    expect(() => parseDateInput("2026-00-01")).toThrow(ValidationError);
  });

  it("rejects invalid calendar dates", () => {
    expect(() => parseDateInput("2026-02-30")).toThrow(ValidationError);
  });

  it("rejects non-ISO date formats", () => {
    expect(() => parseDateInput("2026-1-05")).toThrow(ValidationError);
  });

  it("formats a period label", () => {
    const start = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2026, 0, 31));
    expect(formatPeriodLabel(start, end)).toBe("01 Jan 2026 – 31 Jan 2026");
  });

  it("accepts reasonable weekly periods", () => {
    const start = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2026, 0, 7));
    expect(() => assertReasonablePeriod(start, end, "WEEKLY")).not.toThrow();
  });

  it("rejects unreasonable weekly periods", () => {
    const start = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2026, 0, 20));
    expect(() => assertReasonablePeriod(start, end, "WEEKLY")).toThrow(
      ValidationError
    );
  });
});
