import "server-only";

import { prisma, type PayRunStatus, type SourceType } from "@/lib/prisma";
import { resolveRequiredSources } from "@/lib/required-sources";
import { getOpenExceptionCounts } from "@/lib/pay-run-exceptions";

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

  const requiredSources = resolveRequiredSources(firm?.defaults);

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
    select: { id: true, status: true }
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

  const openExceptionCounts = await getOpenExceptionCounts(firmId, payRunIds);
  const reconciledIds = payRuns
    .filter((payRun) => payRun.status === "RECONCILED")
    .map((payRun) => payRun.id);
  const exceptionsOpenCount = reconciledIds.filter((id) =>
    openExceptionCounts.has(id)
  ).length;
  if (exceptionsOpenCount > 0) {
    const reconciledCount = countsByStatus.RECONCILED ?? 0;
    countsByStatus.RECONCILED = Math.max(0, reconciledCount - exceptionsOpenCount);
    countsByStatus.EXCEPTIONS_OPEN = exceptionsOpenCount;
  }

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
