import { describe, expect, it } from "vitest";
import { formatPeriodLabel, parseDateInput } from "@/lib/pay-run-utils";
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

  it("formats a period label", () => {
    const start = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2026, 0, 31));
    expect(formatPeriodLabel(start, end)).toBe("01 Jan 2026 – 31 Jan 2026");
  });
});
