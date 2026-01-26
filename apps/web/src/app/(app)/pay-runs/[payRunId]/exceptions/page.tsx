import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

type PayRunExceptionsPageProps = {
  params: { payRunId: string };
};

export default async function PayRunExceptionsPage({
  params
}: PayRunExceptionsPageProps) {
  const { session } = await requireUser();

  const payRun = await prisma.payRun.findFirst({
    where: {
      id: params.payRunId,
      firmId: session.firmId
    },
    include: {
      client: true
    }
  });

  if (!payRun) {
    notFound();
  }

  const exceptions = await prisma.exception.findMany({
    where: {
      firmId: session.firmId,
      payRunId: payRun.id,
      supersededAt: null
    },
    include: {
      assignedToUser: true
    },
    orderBy: [{ createdAt: "desc" }]
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate">
            Exceptions
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink">
            {payRun.client.name} · {payRun.periodLabel}
          </h1>
          <p className="mt-2 text-sm text-slate">Revision {payRun.revision}</p>
        </div>
        <Link
          href={`/pay-runs/${payRun.id}` as Route}
          className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
        >
          Back to pay run
        </Link>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate/20 text-xs uppercase tracking-[0.2em] text-slate">
            <tr>
              <th className="px-4 py-3">Exception</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assignee</th>
              <th className="px-4 py-3">Last update</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {exceptions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-sm text-slate">
                  <p>No exceptions for this pay run yet.</p>
                  <p className="mt-1 text-xs text-slate">
                    Exceptions are generated when reconciliation checks fail.
                  </p>
                  <Link
                    href={`/pay-runs/${payRun.id}` as Route}
                    className="mt-3 inline-flex text-xs font-semibold uppercase tracking-wide text-accent hover:text-accent-strong"
                  >
                    Back to pay run
                  </Link>
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
                    {exception.updatedAt.toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short"
                    })}
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
