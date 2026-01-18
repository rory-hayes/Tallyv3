import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import {
  prisma,
  type MappingTemplateStatus,
  type SourceType
} from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  detectColumnDrift,
  mappingFieldConfigs,
  type ColumnMap
} from "@/lib/mapping-utils";
import { TemplateStatusActions } from "./TemplateStatusActions";

export const dynamic = "force-dynamic";

type TemplateDetailPageProps = {
  params: { templateId: string };
};

const sourceLabels: Record<SourceType, string> = {
  REGISTER: "Register",
  BANK: "Bank / Payments",
  GL: "GL Journal",
  STATUTORY: "Statutory Totals"
};

const statusLabels: Record<MappingTemplateStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  DEPRECATED: "Deprecated"
};

const normalizeColumns = (value: unknown): string[] =>
  Array.isArray(value) ? (value as string[]).filter(Boolean) : [];

export default async function TemplateDetailPage({
  params
}: TemplateDetailPageProps) {
  const { session, user } = await requireUser();

  const template = await prisma.mappingTemplate.findFirst({
    where: {
      id: params.templateId,
      firmId: session.firmId
    },
    include: {
      client: true,
      createdByUser: true
    }
  });

  if (!template) {
    notFound();
  }

  const versions = await prisma.mappingTemplate.findMany({
    where: {
      firmId: session.firmId,
      name: template.name,
      sourceType: template.sourceType,
      clientId: template.clientId
    },
    include: {
      createdByUser: true
    },
    orderBy: { version: "desc" }
  });

  const versionIds = versions.map((version) => version.id);
  const usage = versionIds.length
    ? await prisma.import.findMany({
        where: {
          firmId: session.firmId,
          mappingTemplateVersionId: { in: versionIds }
        },
        select: {
          mappingTemplateVersionId: true,
          uploadedAt: true
        },
        orderBy: [{ uploadedAt: "desc" }]
      })
    : [];

  const lastUsedByVersion = new Map<string, Date>();
  for (const entry of usage) {
    if (!entry.mappingTemplateVersionId) {
      continue;
    }
    if (!lastUsedByVersion.has(entry.mappingTemplateVersionId)) {
      lastUsedByVersion.set(entry.mappingTemplateVersionId, entry.uploadedAt);
    }
  }

  const config = mappingFieldConfigs[template.sourceType];
  const columnMap = template.columnMap as ColumnMap;
  const mappedFields = config.fields.map((field) => ({
    ...field,
    mappedColumn: columnMap[field.key] ?? null
  }));

  const requiredFieldCoverage = config.requiredFields.map((key) => {
    const field = config.fields.find((entry) => entry.key === key);
    return {
      key,
      label: field?.label ?? key,
      mapped: Boolean(columnMap[key])
    };
  });

  const requiredGroupCoverage = (config.requiredGroups ?? []).map((group) => {
    const mapped = group.fields.some((field) => Boolean(columnMap[field]));
    return {
      label: group.label,
      mapped
    };
  });

  const requiredFieldMappedCount = requiredFieldCoverage.filter((item) => item.mapped)
    .length;
  const requiredGroupMappedCount = requiredGroupCoverage.filter((item) => item.mapped)
    .length;

  const sourceColumns = normalizeColumns(template.sourceColumns);

  const canManage = user.role === "ADMIN" || user.role === "PREPARER";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate">Template</p>
          <h1 className="font-display text-3xl font-semibold text-ink">
            {template.name}
          </h1>
          <p className="mt-2 text-sm text-slate">
            {template.client ? template.client.name : "Firm-wide"} ·
            {" "}
            {sourceLabels[template.sourceType]} · v{template.version} ·
            {" "}
            {statusLabels[template.status]}
          </p>
        </div>
        <Link
          href={"/templates" as Route}
          className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
        >
          Back to templates
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate/20 bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate">Summary</p>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate">Scope</span>
              <span className="font-semibold text-ink">
                {template.client ? "Client" : "Firm"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate">Status</span>
              <span className="font-semibold text-ink">
                {statusLabels[template.status]}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate">Last used</span>
              <span className="font-semibold text-ink">
                {lastUsedByVersion.get(template.id)?.toLocaleDateString("en-GB") ??
                  "Not used"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate">Required fields</span>
              <span className="font-semibold text-ink">
                {requiredFieldMappedCount}/{requiredFieldCoverage.length}
              </span>
            </div>
            {requiredGroupCoverage.length > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-slate">Required groups</span>
                <span className="font-semibold text-ink">
                  {requiredGroupMappedCount}/{requiredGroupCoverage.length}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-slate/20 bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate">
            Required coverage
          </p>
          <div className="mt-3 space-y-2 text-sm">
            {requiredFieldCoverage.map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <span className="text-slate">{item.label}</span>
                <span className="font-semibold text-ink">
                  {item.mapped ? "Mapped" : "Missing"}
                </span>
              </div>
            ))}
            {requiredGroupCoverage.map((group) => (
              <div key={group.label} className="flex items-center justify-between">
                <span className="text-slate">{group.label}</span>
                <span className="font-semibold text-ink">
                  {group.mapped ? "Mapped" : "Missing"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate/20 bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate">
            Status actions
          </p>
          <div className="mt-3">
            <TemplateStatusActions
              templateId={template.id}
              currentStatus={template.status}
              canManage={canManage}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate">
              Mapping summary
            </p>
            <p className="mt-2 text-sm text-slate">
              Review how input columns map to the normalized schema.
            </p>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate/20 text-xs uppercase tracking-[0.2em] text-slate">
              <tr>
                <th className="px-3 py-2">Field</th>
                <th className="px-3 py-2">Mapped column</th>
                <th className="px-3 py-2">Required</th>
              </tr>
            </thead>
            <tbody>
              {mappedFields.map((field) => (
                <tr key={field.key} className="border-b border-slate/10">
                  <td className="px-3 py-2 font-medium text-ink">{field.label}</td>
                  <td className="px-3 py-2 text-slate">
                    {field.mappedColumn ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-slate">
                    {field.required ? "Required" : "Optional"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-slate">Source columns</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {sourceColumns.length === 0 ? (
            <span className="text-sm text-slate">No column snapshot recorded.</span>
          ) : (
            sourceColumns.map((column) => (
              <span
                key={column}
                className="rounded-full border border-slate/20 bg-surface-muted px-3 py-1 text-xs text-slate"
              >
                {column}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface">
        <div className="border-b border-slate/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Version history</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate/20 text-xs uppercase tracking-[0.2em] text-slate">
            <tr>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Created by</th>
              <th className="px-4 py-3">Last used</th>
              <th className="px-4 py-3">Drift notes</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((version, index) => {
              const previous = versions[index + 1];
              const drift = previous
                ? detectColumnDrift(
                    normalizeColumns(previous.sourceColumns),
                    normalizeColumns(version.sourceColumns)
                  )
                : null;
              const driftSummary = drift
                ? drift.drifted
                  ? `Added ${drift.added.length}, Missing ${drift.missing.length}`
                  : "No change"
                : "Base version";
              return (
                <tr key={version.id} className="border-b border-slate/10">
                  <td className="px-4 py-3 font-semibold text-ink">v{version.version}</td>
                  <td className="px-4 py-3 text-slate">
                    {statusLabels[version.status]}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {version.createdAt.toLocaleDateString("en-GB")}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {version.createdByUser.email}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {lastUsedByVersion.get(version.id)?.toLocaleDateString("en-GB") ??
                      "Not used"}
                  </td>
                  <td className="px-4 py-3 text-slate">{driftSummary}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
