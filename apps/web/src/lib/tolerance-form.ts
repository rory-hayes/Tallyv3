import "server-only";

import { ValidationError } from "./errors";
import type { ToleranceSettings } from "./tolerances";

const parseNumeric = (value: FormDataEntryValue | null): number => {
  if (typeof value !== "string") {
    throw new ValidationError("Invalid tolerance input.");
  }
  const cleaned = value.trim().replace(/[^0-9.-]/g, "");
  if (!cleaned) {
    throw new ValidationError("Tolerance values are required.");
  }
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ValidationError("Tolerance values must be valid numbers.");
  }
  return parsed;
};

const parseCurrencyCents = (value: FormDataEntryValue | null): number =>
  Math.round(parseNumeric(value) * 100);

const parsePercent = (value: FormDataEntryValue | null): number => parseNumeric(value);

export const parseToleranceForm = (formData: FormData): ToleranceSettings => ({
  registerNetToBank: {
    absoluteCents: parseCurrencyCents(formData.get("registerNetToBankAbsolute")),
    percent: parsePercent(formData.get("registerNetToBankPercent"))
  },
  journalBalance: {
    absoluteCents: parseCurrencyCents(formData.get("journalBalanceAbsolute")),
    percent: parsePercent(formData.get("journalBalancePercent"))
  },
  statutoryTotals: {
    absoluteCents: parseCurrencyCents(formData.get("statutoryTotalsAbsolute")),
    percent: parsePercent(formData.get("statutoryTotalsPercent"))
  },
  journalTieOut: {
    absoluteCents: parseCurrencyCents(formData.get("journalTieOutAbsolute")),
    percent: parsePercent(formData.get("journalTieOutPercent"))
  },
  bankCountMismatchPercent: parsePercent(
    formData.get("bankCountMismatchPercent")
  )
});
