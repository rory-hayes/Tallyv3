import "server-only";

import { prisma } from "@/lib/prisma";

export type AuditExportFilters = {
  firmId: string;
  clientId?: string | null;
  from?: Date | null;
  to?: Date | null;
};

export type AuditExportRow = {
  id: string;
  timestamp: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown> | null;
};

const buildEntityFilter = (entityType: string, ids: string[]) =>
  ids.length > 0 ? { entityType, entityId: { in: ids } } : null;

const getClientScopedEntityIds = async (firmId: string, clientId: string) => {
  const payRuns = await prisma.payRun.findMany({
    where: { firmId, clientId },
    select: { id: true }
  });
  const payRunIds = payRuns.map((entry) => entry.id);

  const [imports, exceptions, packs] = payRunIds.length
    ? await Promise.all([
        prisma.import.findMany({
          where: { firmId, payRunId: { in: payRunIds } },
          select: { id: true }
        }),
        prisma.exception.findMany({
          where: { firmId, payRunId: { in: payRunIds } },
          select: { id: true }
        }),
        prisma.pack.findMany({
          where: { firmId, payRunId: { in: payRunIds } },
          select: { id: true }
        })
      ])
    : [[], [], []];

  const templates = await prisma.mappingTemplate.findMany({
    where: { firmId, clientId },
    select: { id: true }
  });

  return {
    payRunIds,
    importIds: imports.map((entry) => entry.id),
    exceptionIds: exceptions.map((entry) => entry.id),
    packIds: packs.map((entry) => entry.id),
    templateIds: templates.map((entry) => entry.id)
  };
};

export const getAuditExportRows = async ({
  firmId,
  clientId,
  from,
  to
}: AuditExportFilters): Promise<AuditExportRow[]> => {
  const where: {
    firmId: string;
    timestamp?: { gte?: Date; lte?: Date };
    OR?: Array<Record<string, unknown>>;
  } = { firmId };

  if (from || to) {
    where.timestamp = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {})
    };
  }

  if (clientId) {
    const ids = await getClientScopedEntityIds(firmId, clientId);
    const orFilters = [
      { entityType: "CLIENT", entityId: clientId },
      buildEntityFilter("PAY_RUN", ids.payRunIds),
      buildEntityFilter("IMPORT", ids.importIds),
      buildEntityFilter("EXCEPTION", ids.exceptionIds),
      buildEntityFilter("PACK", ids.packIds),
      buildEntityFilter("TEMPLATE", ids.templateIds)
    ].filter(Boolean) as Array<Record<string, unknown>>;

    where.OR = orFilters;
  }

  const events = await prisma.auditEvent.findMany({
    where,
    orderBy: { timestamp: "asc" },
    include: {
      actorUser: {
        select: { email: true }
      }
    }
  });

  return events.map((event) => ({
    id: event.id,
    timestamp: event.timestamp,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    actorEmail: event.actorUser?.email ?? null,
    metadata:
      event.metadata && typeof event.metadata === "object"
        ? (event.metadata as Record<string, unknown>)
        : null
  }));
};

const escapeCsvValue = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return "";
  }
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
};

export const buildAuditCsv = (rows: AuditExportRow[]): string => {
  const header = [
    "timestamp",
    "action",
    "entity_type",
    "entity_id",
    "actor_email",
    "metadata"
  ];

  const lines = [header.join(",")];
  rows.forEach((row) => {
    lines.push(
      [
        escapeCsvValue(row.timestamp.toISOString()),
        escapeCsvValue(row.action),
        escapeCsvValue(row.entityType),
        escapeCsvValue(row.entityId ?? ""),
        escapeCsvValue(row.actorEmail ?? ""),
        escapeCsvValue(row.metadata ? JSON.stringify(row.metadata) : "")
      ].join(",")
    );
  });

  return lines.join("\n");
};
