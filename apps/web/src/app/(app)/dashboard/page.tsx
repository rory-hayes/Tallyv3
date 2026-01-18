import Link from "next/link";
import type { Route } from "next";
import { prisma, type PayRunStatus, type SourceType } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const statusLabels: Record<PayRunStatus, string> = {
  DRAFT: "Draft",
  IMPORTED: "Imported",
  MAPPED: "Mapped",
  RECONCILING: "Reconciling",
  RECONCILED: "Reconciled",
  EXCEPTIONS_OPEN: "Exceptions open",
  READY_FOR_REVIEW: "Ready for review",
  APPROVED: "Approved",
  PACKED: "Packed",
  LOCKED: "Locked",
  ARCHIVED: "Archived"
};

const sourceLabels: Record<SourceType, string> = {
  REGISTER: "Register",
  BANK: "Bank / Payments",
  GL: "GL Journal",
  STATUTORY: "Statutory Totals"
};

const parseRequiredSources = (defaults: unknown): SourceType[] => {
  const fallback: SourceType[] = ["REGISTER", "BANK", "GL"];
  if (!defaults || typeof defaults !== "object") {
    return fallback;
  }

  const required = (defaults as { requiredSources?: Record<string, unknown> })
    .requiredSources;
  if (!required || typeof required !== "object") {
    return fallback;
  }

  const sources: SourceType[] = [];
  if (required.register === true) sources.push("REGISTER");
  if (required.bank === true) sources.push("BANK");
  if (required.gl === true) sources.push("GL");
  if (required.statutory === true) sources.push("STATUTORY");
  return sources.length > 0 ? sources : fallback;
};

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");

export default async function DashboardPage() {
  const { session } = await requireUser();
  const firm = await prisma.firm.findFirst({
    where: { id: session.firmId },
    select: { defaults: true }
  });

  const requiredSources = parseRequiredSources(firm?.defaults);

  const statusCounts = await prisma.payRun.groupBy({
    by: ["status"],
    where: { firmId: session.firmId },
    _count: { status: true }
  });

  const countsByStatus = statusCounts.reduce<Record<string, number>>(
    (acc, entry) => {
      acc[entry.status] = entry._count.status;
      return acc;
    },
    {}
  );

  const payRuns = await prisma.payRun.findMany({
    where: {
      firmId: session.firmId,
      status: { notIn: ["ARCHIVED"] }
    },
    select: {
      id: true
    }
  });

  const payRunIds = payRuns.map((payRun) => payRun.id);
  const imports = payRunIds.length
    ? await prisma.import.findMany({
        where: {
          firmId: session.firmId,
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

  const auditEvents = await prisma.auditEvent.findMany({
    where: { firmId: session.firmId },
    orderBy: { timestamp: "desc" },
    take: 8
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">
          Payroll workspace
        </h1>
        <p className="mt-2 text-sm text-slate">
          A live view of workflow health across your pay runs.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {["DRAFT", "MAPPED", "EXCEPTIONS_OPEN", "READY_FOR_REVIEW", "LOCKED"].map(
          (status) => (
            <div
              key={status}
              className="rounded-xl border border-slate/20 bg-surface p-4"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-slate">
                {statusLabels[status as PayRunStatus]}
              </p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {countsByStatus[status] ?? 0}
              </p>
              <p className="mt-1 text-xs text-slate">Pay runs</p>
            </div>
          )
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate/20 bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate">
            Next steps
          </p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink">Missing sources</span>
              <span className="font-semibold text-ink">{missingSourcesCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink">Mapping required</span>
              <span className="font-semibold text-ink">{mappingRequiredCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink">Approvals pending</span>
              <span className="font-semibold text-ink">{approvalsPending}</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={"/pay-runs" as Route}
              className="text-xs font-semibold uppercase tracking-wide text-accent hover:text-accent-strong"
            >
              View pay runs
            </Link>
            <Link
              href={"/exceptions" as Route}
              className="text-xs font-semibold uppercase tracking-wide text-slate hover:text-ink"
            >
              Review exceptions
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-slate/20 bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate">
            Quick actions
          </p>
          <div className="mt-4 space-y-3 text-sm">
            <Link
              href={"/clients/new" as Route}
              className="flex items-center justify-between rounded-lg border border-slate/20 px-3 py-2 text-ink hover:border-slate/40"
            >
              <span>New client</span>
              <span className="text-xs text-slate">Create</span>
            </Link>
            <Link
              href={"/pay-runs/new" as Route}
              className="flex items-center justify-between rounded-lg border border-slate/20 px-3 py-2 text-ink hover:border-slate/40"
            >
              <span>New pay run</span>
              <span className="text-xs text-slate">Start</span>
            </Link>
            <Link
              href={"/templates" as Route}
              className="flex items-center justify-between rounded-lg border border-slate/20 px-3 py-2 text-ink hover:border-slate/40"
            >
              <span>Template library</span>
              <span className="text-xs text-slate">Manage</span>
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-slate/20 bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate">
            Required sources
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate">
            {requiredSources.map((source) => (
              <span
                key={source}
                className="rounded-full border border-slate/20 bg-surface-muted px-3 py-1"
              >
                {sourceLabels[source]}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate">
            Defaults can be adjusted under firm settings.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface">
        <div className="flex items-center justify-between border-b border-slate/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
          <Link
            href={"/settings/audit-log" as Route}
            className="text-xs font-semibold uppercase tracking-wide text-slate hover:text-ink"
          >
            View audit log
          </Link>
        </div>
        <div className="divide-y divide-slate/10">
          {auditEvents.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate">
              No activity yet. Actions will appear here as they happen.
            </p>
          ) : (
            auditEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {titleCase(event.action)} · {event.entityType}
                  </p>
                  <p className="text-xs text-slate">{event.id}</p>
                </div>
                <p className="text-xs text-slate">
                  {event.timestamp.toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short"
                  })}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
