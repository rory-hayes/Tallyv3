import "server-only";

import { prisma, type PayRunStatus } from "@/lib/prisma";

export const getOpenExceptionCounts = async (
  firmId: string,
  payRunIds: string[]
): Promise<Map<string, number>> => {
  if (payRunIds.length === 0) {
    return new Map();
  }

  const grouped = await prisma.exception.groupBy({
    by: ["payRunId"],
    where: {
      firmId,
      payRunId: { in: payRunIds },
      status: "OPEN",
      supersededAt: null
    },
    _count: { payRunId: true }
  });

  return new Map(grouped.map((entry) => [entry.payRunId, entry._count.payRunId]));
};

export const derivePayRunStatus = (
  status: PayRunStatus,
  openExceptionCount: number
): PayRunStatus => {
  if (status === "RECONCILED" && openExceptionCount > 0) {
    return "EXCEPTIONS_OPEN";
  }
  return status;
};
