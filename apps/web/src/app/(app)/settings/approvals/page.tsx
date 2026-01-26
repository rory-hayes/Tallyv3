import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { SettingsNav } from "@/components/SettingsNav";
import { updateApprovalSettingsAction } from "./actions";

const parseApprovalSettings = (defaults: unknown) => {
  if (!defaults || typeof defaults !== "object") {
    return { allowSelfApproval: false };
  }
  const settings = (defaults as { approvalSettings?: Record<string, unknown> })
    .approvalSettings;
  return {
    allowSelfApproval: settings?.allowSelfApproval === true
  };
};

export default async function ApprovalSettingsPage() {
  const { session, user } = await requireUser();
  requirePermission(user.role, "firm:manage");

  const firm = await prisma.firm.findFirst({
    where: { id: session.firmId }
  });

  const approvalSettings = parseApprovalSettings(firm?.defaults);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">
          Approvals
        </h1>
        <p className="mt-2 text-sm text-slate">
          Control reviewer approval rules for pay runs.
        </p>
      </div>
      <SettingsNav />

      <form
        action={updateApprovalSettingsAction}
        className="space-y-4 rounded-xl border border-slate/20 bg-surface p-6"
      >
        <label className="flex items-start gap-3 text-sm text-slate">
          <input
            name="allowSelfApproval"
            type="checkbox"
            defaultChecked={approvalSettings.allowSelfApproval}
            className="mt-1 h-4 w-4 rounded border-slate/40"
          />
          <span>
            <span className="font-semibold text-ink">Allow self-approval</span>
            <span className="mt-1 block text-xs text-slate">
              When enabled, reviewers may approve pay runs they submitted for
              review.
            </span>
          </span>
        </label>

        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-accent-strong"
        >
          Save approval settings
        </button>
      </form>
    </div>
  );
}
