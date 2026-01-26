import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { prisma, type PayrollSystem, type PayRunStatus } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { derivePayRunStatus, getOpenExceptionCounts } from "@/lib/pay-run-exceptions";

type ClientDetailPageProps = {
  params: { clientId: string };
};

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { session } = await requireUser();
  const client = await prisma.client.findFirst({
    where: {
      id: params.clientId,
      firmId: session.firmId
    },
    include: {
      defaultReviewer: true
    }
  });

  if (!client) {
    notFound();
  }

  const payRuns = await prisma.payRun.findMany({
    where: {
      firmId: session.firmId,
      clientId: client.id
    },
    orderBy: [{ periodStart: "desc" }, { revision: "desc" }]
  });

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

  const packs = await prisma.pack.findMany({
    where: {
      firmId: session.firmId,
      payRun: {
        clientId: client.id
      }
    },
    include: {
      payRun: true
    },
    orderBy: [{ generatedAt: "desc" }],
    take: 5
  });

  const packRows = packs.map((pack) => ({
    id: pack.id,
    periodLabel: pack.payRun.periodLabel,
    packVersion: pack.packVersion,
    generatedAt: pack.generatedAt,
    lockedAt: pack.lockedAt,
    downloadUrl: `/packs/${pack.id}/download`
  }));

  const badgeBase =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

  const payrollSystemLabels: Record<PayrollSystem, string> = {
    BRIGHTPAY: "BrightPay",
    STAFFOLOGY: "Staffology",
    OTHER: "Other"
  };

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate">Client</p>
          <h1 className="font-display text-3xl font-semibold text-ink">{client.name}</h1>
          <p className="mt-2 text-sm text-slate">
            {client.payrollSystem === "OTHER"
              ? client.payrollSystemOther || "Other"
              : payrollSystemLabels[client.payrollSystem]}{" "}
            · {client.payrollFrequency}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/clients/${client.id}/edit` as Route}
            className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
          >
            Edit
          </Link>
          <Link
            href={`/clients/${client.id}/account-classifications` as Route}
            className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
          >
            Account classes
          </Link>
          <Link
            href={`/clients/${client.id}/tolerances` as Route}
            className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
          >
            Tolerances
          </Link>
          <Link
            href={`/clients/${client.id}/expected-variances` as Route}
            className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
          >
            Expected variances
          </Link>
          {!client.archivedAt ? (
            <Link
              href={`/pay-runs/new?clientId=${client.id}` as Route}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-accent-strong"
            >
              New pay run
            </Link>
          ) : (
            <span className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rose-700">
              Archived
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate/20 bg-surface p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate">Default reviewer</p>
          <p className="mt-2 text-sm font-semibold text-ink">
            {client.defaultReviewer?.email ?? "None"}
          </p>
        </div>
        <div className="rounded-xl border border-slate/20 bg-surface p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate">Status</p>
          <p className="mt-2 text-sm font-semibold text-ink">
            {client.archivedAt ? "Archived" : "Active"}
          </p>
        </div>
        <div className="rounded-xl border border-slate/20 bg-surface p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate">Pay runs</p>
          <p className="mt-2 text-sm font-semibold text-ink">{payRuns.length}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface">
        <div className="flex items-center justify-between border-b border-slate/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Pay runs</h2>
          <Link
            href={`/pay-runs/new?clientId=${client.id}` as Route}
            className="text-xs font-semibold uppercase tracking-wide text-slate hover:text-ink"
          >
            Create pay run
          </Link>
        </div>
        <div className="px-4 py-2">
          {payRunRows.length === 0 ? (
            <p className="py-4 text-sm text-slate">
              No pay runs yet. Create the first pay run for this client.
            </p>
          ) : (
            <ul className="divide-y divide-slate/10">
              {payRunRows.map((payRun) => (
                <li key={payRun.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{payRun.periodLabel}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate">
                      <span>Revision {payRun.revision}</span>
                      <span
                        className={`${badgeBase} ${statusBadgeClasses[payRun.displayStatus]}`}
                      >
                        {statusLabels[payRun.displayStatus]}
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/pay-runs/${payRun.id}` as Route}
                    className="text-xs font-semibold uppercase tracking-wide text-accent hover:text-accent-strong"
                  >
                    View
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface">
        <div className="flex items-center justify-between border-b border-slate/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Packs</h2>
          <Link
            href={`/packs?clientId=${client.id}` as Route}
            className="text-xs font-semibold uppercase tracking-wide text-slate hover:text-ink"
          >
            View all packs
          </Link>
        </div>
        <div className="px-4 py-2">
          {packRows.length === 0 ? (
            <p className="py-4 text-sm text-slate">
              No packs generated yet for this client.
            </p>
          ) : (
            <ul className="divide-y divide-slate/10">
              {packRows.map((pack) => (
                <li key={pack.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {pack.periodLabel}
                    </p>
                    <p className="text-xs text-slate">
                      Pack v{pack.packVersion} ·{" "}
                      {pack.generatedAt.toLocaleString("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short"
                      })}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate">
                      <span
                        className={`${badgeBase} ${
                          pack.lockedAt
                            ? lockBadgeClasses.locked
                            : lockBadgeClasses.unlocked
                        }`}
                      >
                        {pack.lockedAt ? "Locked" : "Unlocked"}
                      </span>
                      {pack.lockedAt ? (
                        <span>
                          {pack.lockedAt.toLocaleString("en-GB", {
                            dateStyle: "medium",
                            timeStyle: "short"
                          })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <a
                    href={pack.downloadUrl}
                    className="text-xs font-semibold uppercase tracking-wide text-accent hover:text-accent-strong"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
