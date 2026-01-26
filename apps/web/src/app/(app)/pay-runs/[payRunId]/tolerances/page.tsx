import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { resolveTolerances } from "@/lib/tolerances";
import { ToleranceFields } from "@/components/ToleranceFields";
import {
  updatePayRunTolerancesAction,
  resetPayRunTolerancesAction
} from "./actions";

type PayRunTolerancesPageProps = {
  params: { payRunId: string };
};

const hasToleranceOverrides = (settings: unknown) => {
  if (!settings || typeof settings !== "object") {
    return false;
  }
  return Boolean((settings as { tolerances?: unknown }).tolerances);
};

export default async function PayRunTolerancesPage({
  params
}: PayRunTolerancesPageProps) {
  const { session, user } = await requireUser();

  const payRun = await prisma.payRun.findFirst({
    where: {
      id: params.payRunId,
      firmId: session.firmId
    },
    include: {
      client: { include: { firm: true } }
    }
  });

  if (!payRun) {
    notFound();
  }

  const tolerances = resolveTolerances({
    region: payRun.client.firm.region,
    firmDefaults: payRun.client.firm.defaults,
    clientSettings: payRun.client.settings,
    payRunSettings: payRun.settings
  });
  const currencySymbol = payRun.client.firm.region === "IE" ? "€" : "£";
  const canEdit = user.role === "ADMIN" || user.role === "REVIEWER";
  const locked = payRun.status === "LOCKED" || payRun.status === "ARCHIVED";
  const overrides = hasToleranceOverrides(payRun.settings);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate">Pay run</p>
          <h1 className="font-display text-3xl font-semibold text-ink">
            {payRun.client.name} · {payRun.periodLabel} · Tolerances
          </h1>
          <p className="mt-2 text-sm text-slate">
            Overrides apply only to this pay run revision.
          </p>
        </div>
        <Link
          href={`/pay-runs/${payRun.id}` as Route}
          className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
        >
          Back to pay run
        </Link>
      </div>

      {!canEdit ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Reviewer approval is required to change tolerances.
        </div>
      ) : null}
      {locked ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          Locked pay runs cannot be updated. Create a revision to change tolerances.
        </div>
      ) : null}

      <form
        action={updatePayRunTolerancesAction}
        className="space-y-6 rounded-xl border border-slate/20 bg-surface p-6"
      >
        <input type="hidden" name="payRunId" value={payRun.id} />
        <ToleranceFields
          tolerances={tolerances}
          currencySymbol={currencySymbol}
          disabled={!canEdit || locked}
        />
        <button
          type="submit"
          disabled={!canEdit || locked}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-accent-strong disabled:opacity-50"
        >
          Save pay run overrides
        </button>
      </form>

      {overrides ? (
        <form action={resetPayRunTolerancesAction}>
          <input type="hidden" name="payRunId" value={payRun.id} />
          <button
            type="submit"
            disabled={!canEdit || locked}
            className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60 disabled:opacity-50"
          >
            Reset to client defaults
          </button>
        </form>
      ) : null}
    </div>
  );
}
