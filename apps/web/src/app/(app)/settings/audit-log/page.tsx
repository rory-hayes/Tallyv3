import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { SettingsNav } from "@/components/SettingsNav";
import Link from "next/link";
import type { Route } from "next";

const formatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short"
});

type AuditLogPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  const { session, user } = await requireUser();
  requirePermission(user.role, "audit:view");

  const clientParam =
    typeof searchParams?.clientId === "string" ? searchParams.clientId : "";
  const fromParam =
    typeof searchParams?.from === "string" ? searchParams.from : "";
  const toParam =
    typeof searchParams?.to === "string" ? searchParams.to : "";

  const clients = await prisma.client.findMany({
    where: {
      firmId: session.firmId
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  });

  const events = await prisma.auditEvent.findMany({
    where: {
      firmId: session.firmId
    },
    orderBy: {
      timestamp: "desc"
    },
    take: 50,
    include: {
      actorUser: {
        select: {
          email: true
        }
      }
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Audit log</h1>
        <p className="mt-2 text-sm text-slate">
          Sensitive actions across the workspace are recorded here.
        </p>
      </div>
      <SettingsNav />

      <div className="rounded-xl border border-slate/20 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate">
              Export audit log
            </p>
            <p className="mt-2 text-sm text-slate">
              Download a CSV filtered by client and date range.
            </p>
          </div>
          <Link
            href={"/settings/audit-log/export" as Route}
            className="text-xs font-semibold uppercase tracking-wide text-slate hover:text-ink"
          >
            Download all
          </Link>
        </div>

        <form
          method="GET"
          action="/settings/audit-log/export"
          className="mt-4 grid gap-3 md:grid-cols-4"
        >
          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate">
              Client
            </label>
            <select
              name="clientId"
              defaultValue={clientParam}
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
              From
            </label>
            <input
              type="date"
              name="from"
              defaultValue={fromParam}
              className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate">
              To
            </label>
            <input
              type="date"
              name="to"
              defaultValue={toParam}
              className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-4">
            <button
              type="submit"
              className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
            >
              Download CSV
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface p-5">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate">
                <th className="pb-3">Time</th>
                <th className="pb-3">Action</th>
                <th className="pb-3">Entity</th>
                <th className="pb-3">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate/10">
              {events.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate" colSpan={4}>
                    No audit events yet.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id}>
                    <td className="py-3 text-slate">
                      {formatter.format(event.timestamp)}
                    </td>
                    <td className="py-3 text-ink">{event.action}</td>
                    <td className="py-3 text-slate">
                      {event.entityType}
                      {event.entityId ? ` - ${event.entityId}` : ""}
                    </td>
                    <td className="py-3 text-slate">
                      {event.actorUser?.email ?? "System"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
