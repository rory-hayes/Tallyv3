import Link from "next/link";
import type { Route } from "next";
import { prisma, type PayrollSystem } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { archiveClientAction } from "./actions";

type ClientsPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const { session } = await requireUser();
  const archivedParam = searchParams?.archived;
  const showArchived =
    archivedParam === "1" ||
    archivedParam === "true" ||
    (Array.isArray(archivedParam) && archivedParam.includes("1"));

  const [clients, activeCount, archivedCount] = await Promise.all([
    prisma.client.findMany({
      where: {
        firmId: session.firmId,
        ...(showArchived ? {} : { archivedAt: null })
      },
      include: {
        defaultReviewer: true
      },
      orderBy: { name: "asc" }
    }),
    prisma.client.count({
      where: { firmId: session.firmId, archivedAt: null }
    }),
    prisma.client.count({
      where: { firmId: session.firmId, archivedAt: { not: null } }
    })
  ]);

  const payrollSystemLabels: Record<PayrollSystem, string> = {
    BRIGHTPAY: "BrightPay",
    STAFFOLOGY: "Staffology",
    OTHER: "Other"
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Clients</h1>
          <p className="mt-2 text-sm text-slate">
            Track payroll settings and reviewer defaults per client.
          </p>
        </div>
        <Link
          href={"/clients/new" as Route}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-accent-strong"
        >
          New client
        </Link>
      </div>

      <div className="flex gap-2 text-xs font-semibold uppercase tracking-wide text-slate">
        <Link
          href={"/clients" as Route}
          className={`rounded-full border px-3 py-1.5 ${
            showArchived ? "border-slate/30" : "border-transparent bg-ink text-white"
          }`}
        >
          Active ({activeCount})
        </Link>
        <Link
          href={"/clients?archived=1" as Route}
          className={`rounded-full border px-3 py-1.5 ${
            showArchived ? "border-transparent bg-ink text-white" : "border-slate/30"
          }`}
        >
          Archived ({archivedCount})
        </Link>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate/20 text-xs uppercase tracking-[0.2em] text-slate">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Payroll system</th>
              <th className="px-4 py-3">Frequency</th>
              <th className="px-4 py-3">Default reviewer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-sm text-slate">
                  No clients yet. Create one to start tracking pay runs.
                </td>
              </tr>
            ) : (
              clients.map((client) => (
                <tr key={client.id} className="border-b border-slate/10">
                  <td className="px-4 py-3 font-semibold text-ink">
                    <Link
                      href={`/clients/${client.id}` as Route}
                      className="hover:underline"
                    >
                      {client.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {client.payrollSystem === "OTHER"
                      ? client.payrollSystemOther || "Other"
                      : payrollSystemLabels[client.payrollSystem]}
                  </td>
                  <td className="px-4 py-3 text-slate">{client.payrollFrequency}</td>
                  <td className="px-4 py-3 text-slate">
                    {client.defaultReviewer?.email ?? "None"}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {client.archivedAt ? "Archived" : "Active"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate">
                      <Link
                        href={`/clients/${client.id}/edit` as Route}
                        className="rounded-lg border border-slate/30 px-3 py-1.5 hover:border-slate/60"
                      >
                        Edit
                      </Link>
                      {!client.archivedAt ? (
                        <form action={archiveClientAction}>
                          <input type="hidden" name="clientId" value={client.id} />
                          <input
                            type="hidden"
                            name="returnTo"
                            value={showArchived ? "/clients?archived=1" : "/clients"}
                          />
                          <button
                            type="submit"
                            className="rounded-lg border border-rose-200 px-3 py-1.5 text-rose-700 hover:border-rose-300"
                          >
                            Archive
                          </button>
                        </form>
                      ) : null}
                    </div>
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
