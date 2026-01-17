import { prisma } from "@tally/db";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { SettingsNav } from "@/components/SettingsNav";
import { updateRedactionSettingsAction } from "./actions";

const parseRedaction = (defaults: unknown) => {
  const fallback = {
    maskEmployeeNames: false,
    maskBankDetails: false,
    maskNiNumbers: false
  };

  if (!defaults || typeof defaults !== "object") {
    return fallback;
  }

  const settings = (defaults as { redaction?: Record<string, unknown> }).redaction;
  return {
    maskEmployeeNames: settings?.maskEmployeeNames === true,
    maskBankDetails: settings?.maskBankDetails === true,
    maskNiNumbers: settings?.maskNiNumbers === true
  };
};

export default async function RedactionSettingsPage() {
  const { session, user } = await requireUser();
  requirePermission(user.role, "firm:manage");

  const firm = await prisma.firm.findFirst({
    where: { id: session.firmId }
  });

  const redaction = parseRedaction(firm?.defaults);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">
          Redaction
        </h1>
        <p className="mt-2 text-sm text-slate">
          Control what is masked when generating reconciliation packs.
        </p>
      </div>
      <SettingsNav />

      <form
        action={updateRedactionSettingsAction}
        className="space-y-4 rounded-xl border border-slate/20 bg-surface p-6"
      >
        <label className="flex items-start gap-3 text-sm text-slate">
          <input
            name="maskEmployeeNames"
            type="checkbox"
            defaultChecked={redaction.maskEmployeeNames}
            className="mt-1 h-4 w-4 rounded border-slate/40"
          />
          <span>
            <span className="font-semibold text-ink">Mask employee names</span>
            <span className="mt-1 block text-xs text-slate">
              Employee identifiers are redacted in pack outputs.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm text-slate">
          <input
            name="maskBankDetails"
            type="checkbox"
            defaultChecked={redaction.maskBankDetails}
            className="mt-1 h-4 w-4 rounded border-slate/40"
          />
          <span>
            <span className="font-semibold text-ink">Mask bank details</span>
            <span className="mt-1 block text-xs text-slate">
              Bank account numbers are masked in packs.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm text-slate">
          <input
            name="maskNiNumbers"
            type="checkbox"
            defaultChecked={redaction.maskNiNumbers}
            className="mt-1 h-4 w-4 rounded border-slate/40"
          />
          <span>
            <span className="font-semibold text-ink">Mask NI numbers</span>
            <span className="mt-1 block text-xs text-slate">
              NI numbers are redacted in pack outputs.
            </span>
          </span>
        </label>

        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-accent-strong"
        >
          Save settings
        </button>
      </form>
    </div>
  );
}
