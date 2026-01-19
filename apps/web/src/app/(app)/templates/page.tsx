import Link from "next/link";
import type { Route } from "next";
import { type MappingTemplateStatus, type SourceType } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getTemplateLibraryData } from "@/lib/templates-library";

type TemplatesPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
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

const scopeOptions = [
  { value: "", label: "All scopes" },
  { value: "firm", label: "Firm-wide" },
  { value: "client", label: "Client-specific" }
];

const statusOptions = [
  { value: "", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "DEPRECATED", label: "Deprecated" }
];

const sourceOptions = [
  { value: "", label: "All sources" },
  { value: "REGISTER", label: "Register" },
  { value: "BANK", label: "Bank / Payments" },
  { value: "GL", label: "GL Journal" },
  { value: "STATUTORY", label: "Statutory Totals" }
];

export default async function TemplatesPage({ searchParams }: TemplatesPageProps) {
  const { session } = await requireUser();
  const query = typeof searchParams?.q === "string" ? searchParams.q.trim() : "";
  const clientId =
    typeof searchParams?.clientId === "string" ? searchParams.clientId : "";
  const scope =
    typeof searchParams?.scope === "string" ? searchParams.scope : "";
  const sourceType =
    typeof searchParams?.sourceType === "string" ? searchParams.sourceType : "";
  const status =
    typeof searchParams?.status === "string" ? searchParams.status : "";

  const { templates, clients } = await getTemplateLibraryData(session.firmId, {
    query,
    clientId,
    scope: scope as "firm" | "client" | "",
    sourceType: sourceType ? (sourceType as SourceType) : "",
    status: status ? (status as MappingTemplateStatus) : ""
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Templates</h1>
        <p className="mt-2 text-sm text-slate">
          Browse templates across clients and source types.
        </p>
      </div>

      <form className="grid gap-3 rounded-xl border border-slate/20 bg-surface p-4 md:grid-cols-5">
        <div className="md:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Template name
          </label>
          <input
            name="q"
            type="text"
            defaultValue={query}
            placeholder="Search templates"
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Scope
          </label>
          <select
            name="scope"
            defaultValue={scope}
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          >
            {scopeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Client
          </label>
          <select
            name="clientId"
            defaultValue={clientId}
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          >
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Source
          </label>
          <select
            name="sourceType"
            defaultValue={sourceType}
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          >
            {sourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Status
          </label>
          <select
            name="status"
            defaultValue={status}
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-5">
          <button
            type="submit"
            className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
          >
            Apply filters
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-slate/20 bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate/20 text-xs uppercase tracking-[0.2em] text-slate">
            <tr>
              <th className="px-4 py-3">Template</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last used</th>
              <th className="px-4 py-3">Drift</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-sm text-slate">
                  No templates match these filters.
                </td>
              </tr>
            ) : (
              templates.map((entry) => {
                const { template, drift, lastUsed } = entry;
                return (
                  <tr key={template.id} className="border-b border-slate/10">
                    <td className="px-4 py-3 font-semibold text-ink">
                      {template.name}
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {template.client ? template.client.name : "Firm-wide"}
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {sourceLabels[template.sourceType]}
                    </td>
                    <td className="px-4 py-3 text-slate">v{template.version}</td>
                    <td className="px-4 py-3 text-slate">
                      {template.createdAt.toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {statusLabels[template.status]}
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {lastUsed
                        ? lastUsed.toLocaleDateString("en-GB")
                        : "Not used"}
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {drift}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/templates/${template.id}` as Route}
                        className="text-xs font-semibold uppercase tracking-wide text-accent hover:text-accent-strong"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
