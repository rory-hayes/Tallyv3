import { ValidationError } from "./errors";
import type { PayrollFrequency } from "@/lib/prisma";

export const parseDateInput = (value: string): Date => {
  if (!value) {
    throw new ValidationError("Missing date.");
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new ValidationError("Invalid date.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) {
    throw new ValidationError("Invalid date.");
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ValidationError("Invalid date.");
  }

  return parsed;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const calculateInclusiveDays = (start: Date, end: Date) =>
  Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;

const frequencyRanges: Record<PayrollFrequency, { min: number; max: number }> =
  {
    WEEKLY: { min: 5, max: 9 },
    FORTNIGHTLY: { min: 12, max: 16 },
    MONTHLY: { min: 28, max: 31 },
    OTHER: { min: 1, max: 45 }
  };

export const assertReasonablePeriod = (
  start: Date,
  end: Date,
  frequency: PayrollFrequency
) => {
  const { min, max } = frequencyRanges[frequency];
  const days = calculateInclusiveDays(start, end);
  if (days < min || days > max) {
    throw new ValidationError(
      `Period length (${days} days) is outside the expected ${frequency.toLowerCase()} range (${min}-${max} days).`
    );
  }
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

export const formatPeriodLabel = (start: Date, end: Date): string => {
  return `${dateFormatter.format(start)} – ${dateFormatter.format(end)}`;
};
