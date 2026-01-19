import "server-only";

import {
  prisma,
  type MappingTemplateStatus,
  type SourceType,
  Prisma
} from "@/lib/prisma";
import { detectColumnDrift } from "@/lib/mapping-utils";

export type TemplateLibraryFilters = {
  query?: string;
  clientId?: string;
  scope?: "firm" | "client" | "";
  sourceType?: SourceType | "";
  status?: MappingTemplateStatus | "";
};

type TemplateWithClient = Prisma.MappingTemplateGetPayload<{
  include: { client: true };
}>;

export type TemplateLibraryEntry = {
  template: TemplateWithClient;
  drift: string;
  lastUsed: Date | null;
};

export type TemplateLibraryData = {
  templates: TemplateLibraryEntry[];
  clients: Awaited<ReturnType<typeof prisma.client.findMany>>;
};

export const getTemplateLibraryData = async (
  firmId: string,
  filters: TemplateLibraryFilters
): Promise<TemplateLibraryData> => {
  const query = filters.query?.trim() ?? "";
  const clientId = filters.clientId ?? "";
  const scope = filters.scope ?? "";
  const sourceType = filters.sourceType ?? "";
  const status = filters.status ?? "";

  const templateFilter: Prisma.MappingTemplateWhereInput = {
    firmId,
    ...(query
      ? {
          name: {
            contains: query,
            mode: Prisma.QueryMode.insensitive
          }
        }
      : {}),
    ...(clientId ? { clientId } : {}),
    ...(scope === "firm" ? { clientId: null } : {}),
    ...(scope === "client" ? { clientId: { not: null } } : {}),
    ...(sourceType ? { sourceType } : {}),
    ...(status ? { status } : {})
  };

  const templates = await prisma.mappingTemplate.findMany({
    where: templateFilter,
    include: {
      client: true
    },
    orderBy: [
      { name: "asc" },
      { sourceType: "asc" },
      { clientId: "asc" },
      { version: "desc" }
    ]
  });

  const groupedTemplates = new Map<string, (typeof templates)[number][]>();
  templates.forEach((template) => {
    const key = `${template.clientId ?? "firm"}-${template.sourceType}-${template.name}`;
    const existing = groupedTemplates.get(key) ?? [];
    groupedTemplates.set(key, [...existing, template]);
  });

  const latestTemplates = Array.from(groupedTemplates.values())
    .map((versions) => versions[0])
    .filter(
      (template): template is (typeof templates)[number] => template !== undefined
    );

  const driftByTemplateId = new Map<string, string>();
  for (const versions of groupedTemplates.values()) {
    const latest = versions[0]!;
    const previous = versions[1];
    if (!previous) {
      driftByTemplateId.set(latest.id, "New");
      continue;
    }
    const previousColumns = Array.isArray(previous.sourceColumns)
      ? (previous.sourceColumns as string[])
      : [];
    const latestColumns = Array.isArray(latest.sourceColumns)
      ? (latest.sourceColumns as string[])
      : [];
    const drift = detectColumnDrift(previousColumns, latestColumns);
    driftByTemplateId.set(latest.id, drift.drifted ? "Changed" : "Stable");
  }

  const templateIds = latestTemplates.map((template) => template.id);
  const usage = templateIds.length
    ? await prisma.import.findMany({
        where: {
          firmId,
          mappingTemplateVersionId: { in: templateIds }
        },
        select: {
          mappingTemplateVersionId: true,
          uploadedAt: true
        },
        orderBy: [{ uploadedAt: "desc" }]
      })
    : [];

  const lastUsedMap = new Map<string, Date>();
  for (const entry of usage) {
    const templateId = entry.mappingTemplateVersionId as string;
    if (!lastUsedMap.has(templateId)) {
      lastUsedMap.set(templateId, entry.uploadedAt);
    }
  }

  const templateEntries: TemplateLibraryEntry[] = latestTemplates.map((template) => ({
    template,
    drift: driftByTemplateId.get(template.id) ?? "Unknown",
    lastUsed: lastUsedMap.get(template.id) ?? null
  }));

  const clients = await prisma.client.findMany({
    where: { firmId },
    orderBy: { name: "asc" }
  });

  return {
    templates: templateEntries,
    clients
  };
};
