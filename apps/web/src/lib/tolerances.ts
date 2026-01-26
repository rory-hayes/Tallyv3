import type { Region } from "@/lib/prisma";

export type ToleranceConfig = {
  absoluteCents: number;
  percent: number;
};

export type ToleranceSettings = {
  registerNetToBank: ToleranceConfig;
  journalBalance: ToleranceConfig;
  statutoryTotals: ToleranceConfig;
  journalTieOut: ToleranceConfig;
  bankCountMismatchPercent: number;
};

export type ToleranceOverrides = Partial<{
  registerNetToBank: Partial<ToleranceConfig>;
  journalBalance: Partial<ToleranceConfig>;
  statutoryTotals: Partial<ToleranceConfig>;
  journalTieOut: Partial<ToleranceConfig>;
  bankCountMismatchPercent: number;
}>;

export const toleranceDefinitions = [
  {
    key: "registerNetToBank",
    label: "Register vs bank net total",
    description: "Used for CHK_REGISTER_NET_TO_BANK_TOTAL.",
    type: "amountPercent"
  },
  {
    key: "journalBalance",
    label: "Journal debit/credit balance",
    description: "Used for CHK_JOURNAL_DEBITS_EQUAL_CREDITS.",
    type: "amountPercent"
  },
  {
    key: "statutoryTotals",
    label: "Register vs statutory totals",
    description:
      "Used for CHK_REGISTER_DEDUCTIONS_TO_STATUTORY_TOTALS and CHK_REGISTER_PENSION_TO_PENSION_SCHEDULE.",
    type: "amountPercent"
  },
  {
    key: "journalTieOut",
    label: "Register vs journal tie-out",
    description:
      "Used for register-to-journal expense/liability checks.",
    type: "amountPercent"
  },
  {
    key: "bankCountMismatchPercent",
    label: "Bank payment count mismatch",
    description: "Used for CHK_BANK_PAYMENT_COUNT_MISMATCH.",
    type: "percentOnly"
  }
] as const;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const parseToleranceConfig = (value: unknown): Partial<ToleranceConfig> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const input = value as { absoluteCents?: unknown; percent?: unknown };
  const absolute = isFiniteNumber(input.absoluteCents)
    ? Math.max(0, Math.round(input.absoluteCents))
    : null;
  const percent = isFiniteNumber(input.percent) ? Math.max(0, input.percent) : null;
  if (absolute === null && percent === null) {
    return null;
  }
  return {
    ...(absolute !== null ? { absoluteCents: absolute } : {}),
    ...(percent !== null ? { percent } : {})
  };
};

const parseOverrides = (source: unknown): ToleranceOverrides => {
  if (!source || typeof source !== "object") {
    return {};
  }
  const tolerances = (source as { tolerances?: unknown }).tolerances;
  if (!tolerances || typeof tolerances !== "object") {
    return {};
  }
  const input = tolerances as Record<string, unknown>;
  const overrides: ToleranceOverrides = {};

  const registerNetToBank = parseToleranceConfig(input.registerNetToBank);
  if (registerNetToBank) overrides.registerNetToBank = registerNetToBank;

  const journalBalance = parseToleranceConfig(input.journalBalance);
  if (journalBalance) overrides.journalBalance = journalBalance;

  const statutoryTotals = parseToleranceConfig(input.statutoryTotals);
  if (statutoryTotals) overrides.statutoryTotals = statutoryTotals;

  const journalTieOut = parseToleranceConfig(input.journalTieOut);
  if (journalTieOut) overrides.journalTieOut = journalTieOut;

  if (isFiniteNumber(input.bankCountMismatchPercent)) {
    overrides.bankCountMismatchPercent = Math.max(0, input.bankCountMismatchPercent);
  }

  return overrides;
};

const applyOverrides = (
  base: ToleranceSettings,
  overrides: ToleranceOverrides
): ToleranceSettings => ({
  registerNetToBank: {
    ...base.registerNetToBank,
    ...(overrides.registerNetToBank ?? {})
  },
  journalBalance: {
    ...base.journalBalance,
    ...(overrides.journalBalance ?? {})
  },
  statutoryTotals: {
    ...base.statutoryTotals,
    ...(overrides.statutoryTotals ?? {})
  },
  journalTieOut: {
    ...base.journalTieOut,
    ...(overrides.journalTieOut ?? {})
  },
  bankCountMismatchPercent:
    overrides.bankCountMismatchPercent ?? base.bankCountMismatchPercent
});

export const getBundleToleranceDefaults = (region: Region): ToleranceSettings => {
  if (region === "IE") {
    return {
      registerNetToBank: { absoluteCents: 100, percent: 0.05 },
      journalBalance: { absoluteCents: 50, percent: 0.01 },
      statutoryTotals: { absoluteCents: 100, percent: 0.05 },
      journalTieOut: { absoluteCents: 100, percent: 0.05 },
      bankCountMismatchPercent: 5
    };
  }

  return {
    registerNetToBank: { absoluteCents: 100, percent: 0.05 },
    journalBalance: { absoluteCents: 50, percent: 0.01 },
    statutoryTotals: { absoluteCents: 100, percent: 0.05 },
    journalTieOut: { absoluteCents: 100, percent: 0.05 },
    bankCountMismatchPercent: 5
  };
};

export const resolveTolerances = ({
  region,
  firmDefaults,
  clientSettings,
  payRunSettings
}: {
  region: Region;
  firmDefaults?: unknown;
  clientSettings?: unknown;
  payRunSettings?: unknown;
}): ToleranceSettings => {
  let resolved = getBundleToleranceDefaults(region);
  resolved = applyOverrides(resolved, parseOverrides(firmDefaults));
  resolved = applyOverrides(resolved, parseOverrides(clientSettings));
  resolved = applyOverrides(resolved, parseOverrides(payRunSettings));
  return resolved;
};
