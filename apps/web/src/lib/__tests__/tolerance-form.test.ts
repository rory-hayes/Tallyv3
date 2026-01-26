import { describe, expect, it } from "vitest";
import { parseToleranceForm } from "@/lib/tolerance-form";

const buildFormData = (overrides: Record<string, string> = {}) => {
  const data = new FormData();
  const defaults: Record<string, string> = {
    registerNetToBankAbsolute: "1.25",
    registerNetToBankPercent: "0.5",
    journalBalanceAbsolute: "2.5",
    journalBalancePercent: "0.25",
    statutoryTotalsAbsolute: "3",
    statutoryTotalsPercent: "0.2",
    journalTieOutAbsolute: "4",
    journalTieOutPercent: "0.1",
    bankCountMismatchPercent: "5"
  };

  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    data.set(key, value);
  }

  return data;
};

describe("tolerance form parsing", () => {
  it("parses currency and percent values into settings", () => {
    const formData = buildFormData({
      registerNetToBankAbsolute: "$1,234.50",
      registerNetToBankPercent: "1.5"
    });

    const parsed = parseToleranceForm(formData);

    expect(parsed.registerNetToBank.absoluteCents).toBe(123450);
    expect(parsed.registerNetToBank.percent).toBe(1.5);
    expect(parsed.bankCountMismatchPercent).toBe(5);
  });

  it("rejects missing values", () => {
    const formData = buildFormData();
    formData.delete("journalBalanceAbsolute");

    expect(() => parseToleranceForm(formData)).toThrow("Invalid tolerance input.");
  });

  it("rejects blank and negative values", () => {
    const blank = buildFormData({ statutoryTotalsPercent: "   " });
    expect(() => parseToleranceForm(blank)).toThrow("Tolerance values are required.");

    const negative = buildFormData({ journalTieOutAbsolute: "-1" });
    expect(() => parseToleranceForm(negative)).toThrow(
      "Tolerance values must be valid numbers."
    );
  });
});
