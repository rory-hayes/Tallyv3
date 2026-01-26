import Link from "next/link";
import type { Route } from "next";
import { prisma, type PayRunStatus, Prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { derivePayRunStatus, getOpenExceptionCounts } from "@/lib/pay-run-exceptions";

type SearchPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const badgeBase =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

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

const statusOptions: Array<{ value: PayRunStatus; label: string }> = (
  Object.entries(statusLabels) as Array<[PayRunStatus, string]>
).map(([value, label]) => ({
  value,
  label
}));

const statusBadgeClasses: Record<PayRunStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  IMPORTED: "bg-sky-100 text-sky-700",
  MAPPED: "bg-blue-100 text-blue-700",
  RECONCILING: "bg-amber-100 text-amber-700",
  RECONCILED: "bg-emerald-100 text-emerald-700",
  EXCEPTIONS_OPEN: "bg-rose-100 text-rose-700",
  READY_FOR_REVIEW: "bg-cyan-100 text-cyan-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  PACKED: "bg-sky-100 text-sky-700",
  LOCKED: "bg-slate-200 text-slate-700",
  ARCHIVED: "bg-slate-100 text-slate-500"
};

const lockBadgeClasses = {
  locked: "bg-emerald-100 text-emerald-700",
  unlocked: "bg-amber-100 text-amber-700"
};

const parseDate = (value?: string, endOfDay = false) => {
  if (!value) {
    return null;
  }
  const suffix = endOfDay ? "T23:59:59Z" : "T00:00:00Z";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { session } = await requireUser();
  const query = typeof searchParams?.q === "string" ? searchParams.q.trim() : "";
  const status =
    typeof searchParams?.status === "string" ? searchParams.status : "";
  const statusFilter = status === "EXCEPTIONS_OPEN" ? "" : status;
  const from = typeof searchParams?.from === "string" ? searchParams.from : "";
  const to = typeof searchParams?.to === "string" ? searchParams.to : "";

  const fromDate = parseDate(from);
  const toDate = parseDate(to, true);

  const basePayRunFilter: Prisma.PayRunWhereInput = {
    ...(query
      ? {
          client: {
            name: {
              contains: query,
              mode: Prisma.QueryMode.insensitive
            }
          }
        }
      : {}),
    ...(statusFilter ? { status: statusFilter as PayRunStatus } : {}),
    ...(fromDate ? { periodStart: { gte: fromDate } } : {}),
    ...(toDate ? { periodEnd: { lte: toDate } } : {})
  };

  const [payRuns, packs] = await Promise.all([
    prisma.payRun.findMany({
      where: {
        firmId: session.firmId,
        ...basePayRunFilter
      },
      include: {
        client: true
      },
      orderBy: [{ periodStart: "desc" }, { revision: "desc" }],
      take: 50
    }),
    prisma.pack.findMany({
      where: {
        firmId: session.firmId,
        ...(Object.keys(basePayRunFilter).length > 0
          ? { payRun: { is: basePayRunFilter } }
          : {})
      },
      include: {
        payRun: {
          include: {
            client: true
          }
        }
      },
      orderBy: [{ generatedAt: "desc" }],
      take: 50
    })
  ]);

  const openExceptionCounts = await getOpenExceptionCounts(
    session.firmId,
    payRuns.map((payRun) => payRun.id)
  );
  const payRunRows = payRuns.map((payRun) => ({
    ...payRun,
    displayStatus: derivePayRunStatus(
      payRun.status,
      openExceptionCounts.get(payRun.id) ?? 0
    )
  }));
  const visiblePayRuns =
    status === "EXCEPTIONS_OPEN"
      ? payRunRows.filter((payRun) => payRun.displayStatus === "EXCEPTIONS_OPEN")
      : payRunRows;

  const packRows = packs.map((pack) => ({
    id: pack.id,
    packVersion: pack.packVersion,
    generatedAt: pack.generatedAt,
    lockedAt: pack.lockedAt,
    clientName: pack.payRun.client.name,
    periodLabel: pack.payRun.periodLabel,
    downloadUrl: `/packs/${pack.id}/download`
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Search</h1>
        <p className="mt-2 text-sm text-slate">
          Find pay runs and packs by client and period.
        </p>
      </div>

      <form className="grid gap-3 rounded-xl border border-slate/20 bg-surface p-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Client name
          </label>
          <input
            name="q"
            type="text"
            defaultValue={query}
            placeholder="Search by client name"
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          />
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
            <option value="">All statuses</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            From
          </label>
          <input
            name="from"
            type="date"
            defaultValue={from}
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            To
          </label>
          <input
            name="to"
            type="date"
            defaultValue={to}
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div className="md:col-span-4">
          <button
            type="submit"
            className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
          >
            Search
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-slate/20 bg-surface">
        <div className="border-b border-slate/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Pay runs</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate/20 text-xs uppercase tracking-[0.2em] text-slate">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Revision</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visiblePayRuns.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-sm text-slate">
                  No pay runs match the current search.
                </td>
              </tr>
            ) : (
              visiblePayRuns.map((payRun) => (
                <tr key={payRun.id} className="border-b border-slate/10">
                  <td className="px-4 py-3 font-semibold text-ink">
                    {payRun.client.name}
                  </td>
                  <td className="px-4 py-3 text-slate">{payRun.periodLabel}</td>
                  <td className="px-4 py-3 text-slate">#{payRun.revision}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`${badgeBase} ${statusBadgeClasses[payRun.displayStatus]}`}
                    >
                      {statusLabels[payRun.displayStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/pay-runs/${payRun.id}` as Route}
                      className="text-xs font-semibold uppercase tracking-wide text-accent hover:text-accent-strong"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface">
        <div className="border-b border-slate/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Packs</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate/20 text-xs uppercase tracking-[0.2em] text-slate">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Pack</th>
              <th className="px-4 py-3">Generated</th>
              <th className="px-4 py-3">Locked</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {packRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-sm text-slate">
                  No packs match the current search.
                </td>
              </tr>
            ) : (
              packRows.map((pack) => (
                <tr key={pack.id} className="border-b border-slate/10">
                  <td className="px-4 py-3 font-semibold text-ink">
                    {pack.clientName}
                  </td>
                  <td className="px-4 py-3 text-slate">{pack.periodLabel}</td>
                  <td className="px-4 py-3 text-slate">v{pack.packVersion}</td>
                  <td className="px-4 py-3 text-slate">
                    {pack.generatedAt.toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short"
                    })}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {pack.lockedAt ? (
                      <div className="flex flex-col gap-1">
                        <span className={`${badgeBase} ${lockBadgeClasses.locked}`}>
                          Locked
                        </span>
                        <span className="text-xs text-slate">
                          {pack.lockedAt.toLocaleString("en-GB", {
                            dateStyle: "medium",
                            timeStyle: "short"
                          })}
                        </span>
                      </div>
                    ) : (
                      <span className={`${badgeBase} ${lockBadgeClasses.unlocked}`}>
                        Unlocked
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={pack.downloadUrl}
                      className="text-xs font-semibold uppercase tracking-wide text-accent hover:text-accent-strong"
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
