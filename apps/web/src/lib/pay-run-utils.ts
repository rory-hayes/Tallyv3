import { ValidationError } from "./errors";

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

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

export const formatPeriodLabel = (start: Date, end: Date): string => {
  return `${dateFormatter.format(start)} – ${dateFormatter.format(end)}`;
};
