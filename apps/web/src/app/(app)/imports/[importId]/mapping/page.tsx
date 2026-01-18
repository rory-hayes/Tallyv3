import { notFound } from "next/navigation";
import { prisma, type SourceType } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { MappingWizard } from "./MappingWizard";

type ImportMappingPageProps = {
  params: { importId: string };
};

const sourceLabels: Record<SourceType, string> = {
  REGISTER: "Register",
  BANK: "Bank / Payments",
  GL: "GL Journal",
  STATUTORY: "Statutory Totals"
};

export default async function ImportMappingPage({
  params
}: ImportMappingPageProps) {
  const { session } = await requireUser();

  const importRecord = await prisma.import.findFirst({
    where: {
      id: params.importId,
      firmId: session.firmId
    },
    include: {
      payRun: {
        include: {
          client: true
        }
      }
    }
  });

  if (!importRecord) {
    notFound();
  }

  const templates = await prisma.mappingTemplate.findMany({
    where: {
      firmId: session.firmId,
      sourceType: importRecord.sourceType,
      OR: [{ clientId: importRecord.clientId }, { clientId: null }]
    },
    orderBy: [{ clientId: "desc" }, { name: "asc" }, { version: "desc" }]
  });

  const templateMap = new Map<string, (typeof templates)[number]>();
  for (const template of templates) {
    const scopeKey = `${template.clientId ?? "firm"}:${template.name}`;
    if (!templateMap.has(scopeKey)) {
      templateMap.set(scopeKey, template);
    }
  }

  const latestTemplates = Array.from(templateMap.values()).map((template) => ({
    id: template.id,
    name: template.name,
    version: template.version,
    status: template.status,
    clientId: template.clientId,
    sourceColumns: template.sourceColumns as string[],
    columnMap: template.columnMap as Record<string, string | null>
  }));

  const defaultTemplateName = `${importRecord.payRun.client.name} ${sourceLabels[importRecord.sourceType]}`;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-slate">
          Mapping wizard
        </p>
        <h1 className="font-display text-3xl font-semibold text-ink">
          {sourceLabels[importRecord.sourceType]} · {importRecord.payRun.client.name}
        </h1>
        <p className="mt-2 text-sm text-slate">
          {importRecord.originalFilename} · {importRecord.payRun.periodLabel}
        </p>
      </div>

      <MappingWizard
        importId={importRecord.id}
        payRunId={importRecord.payRunId}
        sourceType={importRecord.sourceType}
        defaultTemplateName={defaultTemplateName}
        templates={latestTemplates}
      />
    </div>
  );
}
