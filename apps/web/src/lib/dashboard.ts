import "server-only";

import { prisma, type PayRunStatus, type SourceType } from "@/lib/prisma";

const fallbackRequiredSources: SourceType[] = ["REGISTER", "BANK", "GL"];

const parseRequiredSources = (defaults: unknown): SourceType[] => {
  if (!defaults || typeof defaults !== "object") {
    return fallbackRequiredSources;
  }

  const required = (defaults as { requiredSources?: Record<string, unknown> })
    .requiredSources;
  if (!required || typeof required !== "object") {
    return fallbackRequiredSources;
  }

  const sources: SourceType[] = [];
  if (required.register === true) sources.push("REGISTER");
  if (required.bank === true) sources.push("BANK");
  if (required.gl === true) sources.push("GL");
  if (required.statutory === true) sources.push("STATUTORY");
  return sources.length > 0 ? sources : fallbackRequiredSources;
};

export type DashboardData = {
  requiredSources: SourceType[];
  countsByStatus: Partial<Record<PayRunStatus, number>>;
  missingSourcesCount: number;
  mappingRequiredCount: number;
  approvalsPending: number;
  recentAuditEvents: Array<{
    id: string;
    action: string;
    entityType: string;
    timestamp: Date;
  }>;
};

export const getDashboardData = async (firmId: string): Promise<DashboardData> => {
  const firm = await prisma.firm.findFirst({
    where: { id: firmId },
    select: { defaults: true }
  });

  const requiredSources = parseRequiredSources(firm?.defaults);

  const statusCounts = await prisma.payRun.groupBy({
    by: ["status"],
    where: { firmId },
    _count: { status: true }
  });

  const countsByStatus = statusCounts.reduce<
    Partial<Record<PayRunStatus, number>>
  >((acc, entry) => {
    acc[entry.status] = entry._count.status;
    return acc;
  }, {});

  const payRuns = await prisma.payRun.findMany({
    where: {
      firmId,
      status: { notIn: ["ARCHIVED"] }
    },
    select: { id: true }
  });

  const payRunIds = payRuns.map((payRun) => payRun.id);
  const imports = payRunIds.length
    ? await prisma.import.findMany({
        where: {
          firmId,
          payRunId: { in: payRunIds },
          sourceType: { in: requiredSources }
        },
        select: {
          payRunId: true,
          sourceType: true,
          version: true,
          mappingTemplateVersionId: true
        },
        orderBy: [{ payRunId: "asc" }, { sourceType: "asc" }, { version: "desc" }]
      })
    : [];

  const latestByPayRunSource = new Map<string, (typeof imports)[number]>();
  for (const entry of imports) {
    const key = `${entry.payRunId}-${entry.sourceType}`;
    if (!latestByPayRunSource.has(key)) {
      latestByPayRunSource.set(key, entry);
    }
  }

  let missingSourcesCount = 0;
  let mappingRequiredCount = 0;
  for (const payRunId of payRunIds) {
    let missing = false;
    let unmapped = false;
    for (const source of requiredSources) {
      const entry = latestByPayRunSource.get(`${payRunId}-${source}`);
      if (!entry) {
        missing = true;
        continue;
      }
      if (!entry.mappingTemplateVersionId) {
        unmapped = true;
      }
    }
    if (missing) {
      missingSourcesCount += 1;
    }
    if (unmapped) {
      mappingRequiredCount += 1;
    }
  }

  const approvalsPending = countsByStatus.READY_FOR_REVIEW ?? 0;

  const recentAuditEvents = await prisma.auditEvent.findMany({
    where: { firmId },
    orderBy: { timestamp: "desc" },
    take: 10,
    select: {
      id: true,
      action: true,
      entityType: true,
      timestamp: true
    }
  });

  return {
    requiredSources,
    countsByStatus,
    missingSourcesCount,
    mappingRequiredCount,
    approvalsPending,
    recentAuditEvents
  };
};
