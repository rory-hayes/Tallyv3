import Link from "next/link";
import type { Route } from "next";
import { prisma, type PayRunStatus } from "@tally/db";
import { requireUser } from "@/lib/auth";

type PayRunsPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const statusOptions: Array<{ value: PayRunStatus; label: string }> = [
  { value: "DRAFT", label: "Draft" },
  { value: "IMPORTED", label: "Imported" },
  { value: "MAPPED", label: "Mapped" },
  { value: "RECONCILING", label: "Reconciling" },
  { value: "RECONCILED", label: "Reconciled" },
  { value: "EXCEPTIONS_OPEN", label: "Exceptions open" },
  { value: "READY_FOR_REVIEW", label: "Ready for review" },
  { value: "APPROVED", label: "Approved" },
  { value: "PACKED", label: "Packed" },
  { value: "LOCKED", label: "Locked" },
  { value: "ARCHIVED", label: "Archived" }
];

export default async function PayRunsPage({ searchParams }: PayRunsPageProps) {
  const { session } = await requireUser();
  const clientId =
    typeof searchParams?.clientId === "string" ? searchParams.clientId : undefined;
  const status =
    typeof searchParams?.status === "string" ? searchParams.status : undefined;
  const from =
    typeof searchParams?.from === "string" ? searchParams.from : undefined;
  const to = typeof searchParams?.to === "string" ? searchParams.to : undefined;

  const clients = await prisma.client.findMany({
    where: {
      firmId: session.firmId,
      archivedAt: null
    },
    orderBy: { name: "asc" }
  });

  const whereClause = {
    firmId: session.firmId,
    ...(clientId ? { clientId } : {}),
    ...(status ? { status: status as PayRunStatus } : {}),
    ...(from
      ? {
          periodStart: { gte: new Date(`${from}T00:00:00Z`) }
        }
      : {}),
    ...(to
      ? {
          periodEnd: { lte: new Date(`${to}T23:59:59Z`) }
        }
      : {})
  };

  const payRuns = await prisma.payRun.findMany({
    where: whereClause,
    include: {
      client: true
    },
    orderBy: [{ periodStart: "desc" }, { revision: "desc" }]
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Pay runs</h1>
          <p className="mt-2 text-sm text-slate">
            Track pay run status, revisions, and upcoming reviews.
          </p>
        </div>
        <Link
          href={"/pay-runs/new" as Route}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-accent-strong"
        >
          New pay run
        </Link>
      </div>

      <form className="grid gap-3 rounded-xl border border-slate/20 bg-surface p-4 md:grid-cols-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Client
          </label>
          <select
            name="clientId"
            defaultValue={clientId ?? ""}
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
            Status
          </label>
          <select
            name="status"
            defaultValue={status ?? ""}
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
            defaultValue={from ?? ""}
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
            defaultValue={to ?? ""}
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div className="md:col-span-4">
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
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Revision</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payRuns.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-sm text-slate">
                  No pay runs match these filters.
                </td>
              </tr>
            ) : (
              payRuns.map((payRun) => (
                <tr key={payRun.id} className="border-b border-slate/10">
                  <td className="px-4 py-3 font-semibold text-ink">
                    {payRun.client.name}
                  </td>
                  <td className="px-4 py-3 text-slate">{payRun.periodLabel}</td>
                  <td className="px-4 py-3 text-slate">#{payRun.revision}</td>
                  <td className="px-4 py-3 text-slate">{payRun.status}</td>
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
    </div>
  );
}
