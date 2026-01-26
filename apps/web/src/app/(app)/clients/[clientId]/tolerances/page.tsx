import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { resolveTolerances } from "@/lib/tolerances";
import { ToleranceFields } from "@/components/ToleranceFields";
import {
  updateClientTolerancesAction,
  resetClientTolerancesAction
} from "./actions";

type ClientTolerancesPageProps = {
  params: { clientId: string };
};

const hasToleranceOverrides = (settings: unknown) => {
  if (!settings || typeof settings !== "object") {
    return false;
  }
  return Boolean((settings as { tolerances?: unknown }).tolerances);
};

export default async function ClientTolerancesPage({
  params
}: ClientTolerancesPageProps) {
  const { session, user } = await requireUser();

  const client = await prisma.client.findFirst({
    where: {
      id: params.clientId,
      firmId: session.firmId
    },
    include: { firm: true }
  });

  if (!client) {
    notFound();
  }

  const tolerances = resolveTolerances({
    region: client.firm.region,
    firmDefaults: client.firm.defaults,
    clientSettings: client.settings
  });
  const currencySymbol = client.firm.region === "IE" ? "€" : "£";
  const canEdit = user.role === "ADMIN" || user.role === "REVIEWER";
  const overrides = hasToleranceOverrides(client.settings);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate">Client</p>
          <h1 className="font-display text-3xl font-semibold text-ink">
            {client.name} · Tolerances
          </h1>
          <p className="mt-2 text-sm text-slate">
            Overrides apply to future reconciliations for this client.
          </p>
        </div>
        <Link
          href={`/clients/${client.id}` as Route}
          className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
        >
          Back to client
        </Link>
      </div>

      {!canEdit ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Reviewer approval is required to change tolerances.
        </div>
      ) : null}

      <form
        action={updateClientTolerancesAction}
        className="space-y-6 rounded-xl border border-slate/20 bg-surface p-6"
      >
        <input type="hidden" name="clientId" value={client.id} />
        <ToleranceFields
          tolerances={tolerances}
          currencySymbol={currencySymbol}
          disabled={!canEdit}
        />
        <button
          type="submit"
          disabled={!canEdit}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-accent-strong disabled:opacity-50"
        >
          Save client overrides
        </button>
      </form>

      {overrides ? (
        <form action={resetClientTolerancesAction}>
          <input type="hidden" name="clientId" value={client.id} />
          <button
            type="submit"
            disabled={!canEdit}
            className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60 disabled:opacity-50"
          >
            Reset to firm defaults
          </button>
        </form>
      ) : null}
    </div>
  );
}
