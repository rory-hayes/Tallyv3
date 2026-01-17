import { ValidationError } from "./errors";

export const parseDateInput = (value: string): Date => {
  if (!value) {
    throw new ValidationError("Missing date.");
  }

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    throw new ValidationError("Invalid date.");
  }

  return new Date(Date.UTC(year, month - 1, day));
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
