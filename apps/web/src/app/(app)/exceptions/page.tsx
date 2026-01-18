import Link from "next/link";
import type { Route } from "next";
import {
  prisma,
  type CheckSeverity,
  type ExceptionCategory,
  type ExceptionStatus
} from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

type ExceptionsPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const statusOptions: Array<{ value: ExceptionStatus; label: string }> = [
  { value: "OPEN", label: "Open" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "DISMISSED", label: "Dismissed" },
  { value: "OVERRIDDEN", label: "Overridden" }
];

const severityOptions: Array<{ value: CheckSeverity; label: string }> = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
  { value: "INFO", label: "Info" }
];

const categoryOptions: Array<{ value: ExceptionCategory; label: string }> = [
  { value: "BANK_MISMATCH", label: "Bank mismatch" },
  { value: "JOURNAL_MISMATCH", label: "Journal mismatch" },
  { value: "STATUTORY_MISMATCH", label: "Statutory mismatch" },
  { value: "SANITY", label: "Sanity" }
];

export default async function ExceptionsPage({ searchParams }: ExceptionsPageProps) {
  const { session } = await requireUser();
  const status =
    typeof searchParams?.status === "string" ? searchParams.status : "";
  const severity =
    typeof searchParams?.severity === "string" ? searchParams.severity : "";
  const category =
    typeof searchParams?.category === "string" ? searchParams.category : "";
  const assignee =
    typeof searchParams?.assignee === "string" ? searchParams.assignee : "";
  const payRunId =
    typeof searchParams?.payRunId === "string" ? searchParams.payRunId : "";

  const [exceptions, users, payRuns] = await Promise.all([
    prisma.exception.findMany({
      where: {
        firmId: session.firmId,
        supersededAt: null,
        ...(status ? { status: status as ExceptionStatus } : {}),
        ...(severity ? { severity: severity as CheckSeverity } : {}),
        ...(category ? { category: category as ExceptionCategory } : {}),
        ...(assignee
          ? assignee === "unassigned"
            ? { assignedToUserId: null }
            : { assignedToUserId: assignee }
          : {}),
        ...(payRunId ? { payRunId } : {})
      },
      include: {
        payRun: { include: { client: true } },
        assignedToUser: true
      },
      orderBy: [{ createdAt: "desc" }]
    }),
    prisma.user.findMany({
      where: {
        firmId: session.firmId,
        status: "ACTIVE"
      },
      orderBy: { email: "asc" }
    }),
    prisma.payRun.findMany({
      where: { firmId: session.firmId },
      include: { client: true },
      orderBy: [{ periodStart: "desc" }, { revision: "desc" }],
      take: 50
    })
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Exceptions</h1>
        <p className="mt-2 text-sm text-slate">
          Triage exceptions by severity and status before review.
        </p>
      </div>

      <form
        method="get"
        className="grid gap-3 rounded-xl border border-slate/20 bg-surface p-4 md:grid-cols-5"
      >
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
            Severity
          </label>
          <select
            name="severity"
            defaultValue={severity}
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          >
            <option value="">All severities</option>
            {severityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Category
          </label>
          <select
            name="category"
            defaultValue={category}
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          >
            <option value="">All categories</option>
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Assignee
          </label>
          <select
            name="assignee"
            defaultValue={assignee}
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          >
            <option value="">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Pay run
          </label>
          <select
            name="payRunId"
            defaultValue={payRunId}
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          >
            <option value="">All pay runs</option>
            {payRuns.map((payRun) => (
              <option key={payRun.id} value={payRun.id}>
                {payRun.client.name} · {payRun.periodLabel} · rev {payRun.revision}
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
              <th className="px-4 py-3">Exception</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assignee</th>
              <th className="px-4 py-3">Pay run</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {exceptions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-sm text-slate">
                  No exceptions match these filters.
                </td>
              </tr>
            ) : (
              exceptions.map((exception) => (
                <tr key={exception.id} className="border-b border-slate/10">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{exception.title}</p>
                    <p className="text-xs text-slate">{exception.category}</p>
                  </td>
                  <td className="px-4 py-3 text-slate">{exception.severity}</td>
                  <td className="px-4 py-3 text-slate">{exception.status}</td>
                  <td className="px-4 py-3 text-slate">
                    {exception.assignedToUser?.email ?? "Unassigned"}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {exception.payRun.client.name} · {exception.payRun.periodLabel}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/exceptions/${exception.id}` as Route}
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
