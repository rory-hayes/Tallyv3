import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { prisma, type PayrollSystem } from "@tally/db";
import { requireUser } from "@/lib/auth";
import { getPackDownloadUrl } from "@/lib/packs";

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

  const packRows = await Promise.all(
    packs.map(async (pack) => ({
      id: pack.id,
      periodLabel: pack.payRun.periodLabel,
      packVersion: pack.packVersion,
      generatedAt: pack.generatedAt,
      downloadUrl: await getPackDownloadUrl(pack)
    }))
  );

  const payrollSystemLabels: Record<PayrollSystem, string> = {
    BRIGHTPAY: "BrightPay",
    STAFFOLOGY: "Staffology",
    OTHER: "Other"
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
          {payRuns.length === 0 ? (
            <p className="py-4 text-sm text-slate">
              No pay runs yet. Create the first pay run for this client.
            </p>
          ) : (
            <ul className="divide-y divide-slate/10">
              {payRuns.map((payRun) => (
                <li key={payRun.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{payRun.periodLabel}</p>
                    <p className="text-xs text-slate">
                      Revision {payRun.revision} · {payRun.status}
                    </p>
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
