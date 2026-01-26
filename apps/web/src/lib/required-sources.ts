import "server-only";

import type { SourceType } from "@/lib/prisma";

const baseRequiredSources: SourceType[] = ["REGISTER", "BANK", "GL"];

const hasTruthy = (value: unknown): value is true => value === true;

export const resolveRequiredSources = (defaults?: unknown): SourceType[] => {
  const sources: SourceType[] = [...baseRequiredSources];

  if (!defaults || typeof defaults !== "object") {
    return sources;
  }

  const required = (defaults as { requiredSources?: Record<string, unknown> })
    .requiredSources;
  if (!required || typeof required !== "object") {
    return sources;
  }

  if (hasTruthy(required.statutory)) {
    sources.push("STATUTORY");
  }

  return sources;
};
