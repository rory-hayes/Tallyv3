import { Prisma } from "@tally/db";

export type AuditMetadata = Record<string, unknown>;

const blockedMetadataKeys = [
  "email",
  "name",
  "bank",
  "account",
  "ni",
  "national",
  "address",
  "phone"
];

export const sanitizeAuditMetadata = (
  metadata?: AuditMetadata
): Prisma.InputJsonObject | null => {
  if (!metadata) {
    return null;
  }

  const cleanedEntries = Object.entries(metadata).filter(([key, value]) => {
    if (blockedMetadataKeys.some((blocked) => key.toLowerCase().includes(blocked))) {
      return false;
    }

    const valueType = typeof value;
    return valueType === "string" || valueType === "number" || valueType === "boolean";
  });

  if (cleanedEntries.length === 0) {
    return null;
  }

  return Object.fromEntries(cleanedEntries) as Prisma.InputJsonObject;
};
