import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { SettingsNav } from "@/components/SettingsNav";
import { resolveTolerances } from "@/lib/tolerances";
import { ToleranceFields } from "@/components/ToleranceFields";
import { updateFirmTolerancesAction } from "./actions";

export default async function TolerancesSettingsPage() {
  const { session, user } = await requireUser();
  requirePermission(user.role, "firm:manage");

  const firm = await prisma.firm.findFirst({
    where: { id: session.firmId }
  });

  if (!firm) {
    return null;
  }

  const tolerances = resolveTolerances({
    region: firm.region,
    firmDefaults: firm.defaults
  });
  const currencySymbol = firm.region === "IE" ? "€" : "£";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">
          Tolerances
        </h1>
        <p className="mt-2 text-sm text-slate">
          Set firm-wide thresholds for reconciliation checks.
        </p>
      </div>
      <SettingsNav />

      <form
        action={updateFirmTolerancesAction}
        className="space-y-6 rounded-xl border border-slate/20 bg-surface p-6"
      >
        <ToleranceFields
          tolerances={tolerances}
          currencySymbol={currencySymbol}
        />

        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-accent-strong"
        >
          Save tolerances
        </button>
      </form>
    </div>
  );
}
