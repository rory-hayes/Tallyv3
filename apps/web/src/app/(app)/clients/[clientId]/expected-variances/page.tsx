import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { prisma, type CheckType, type ExpectedVarianceType } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ExpectedVarianceForm } from "./ExpectedVarianceForm";
import { archiveExpectedVarianceAction } from "./actions";

type ExpectedVariancePageProps = {
  params: { clientId: string };
};

const varianceLabels: Record<ExpectedVarianceType, string> = {
  DIRECTORS_SEPARATE: "Directors paid separately",
  PENSION_SEPARATE: "Pension paid separately",
  ROUNDING: "Rounding differences",
  OTHER: "Other"
};

const checkLabels: Record<CheckType, string> = {
  CHK_REGISTER_NET_TO_BANK_TOTAL: "Register vs Bank totals",
  CHK_JOURNAL_DEBITS_EQUAL_CREDITS: "Journal balance",
  CHK_REGISTER_DEDUCTIONS_TO_STATUTORY_TOTALS: "Register vs Statutory totals",
  CHK_REGISTER_GROSS_TO_JOURNAL_EXPENSE: "Register gross vs Journal expense",
  CHK_REGISTER_EMPLOYER_COSTS_TO_JOURNAL_EXPENSE: "Register employer costs vs Journal",
  CHK_REGISTER_NET_PAY_TO_JOURNAL_LIABILITY: "Register net pay vs Journal liability",
  CHK_REGISTER_TAX_TO_JOURNAL_LIABILITY: "Register tax vs Journal liability",
  CHK_REGISTER_PENSION_TO_JOURNAL_LIABILITY: "Register pension vs Journal liability",
  CHK_REGISTER_PENSION_TO_PENSION_SCHEDULE: "Register pension vs Pension schedule",
  CHK_BANK_DUPLICATE_PAYMENTS: "Bank duplicate payments",
  CHK_BANK_NEGATIVE_PAYMENTS: "Bank negative payments",
  CHK_BANK_PAYMENT_COUNT_MISMATCH: "Bank payment count mismatch"
};

const formatBounds = (bounds?: { min?: number; max?: number }) => {
  if (!bounds) {
    return "Any";
  }
  if (bounds.min !== undefined && bounds.max !== undefined) {
    return `${bounds.min} → ${bounds.max}`;
  }
  if (bounds.min !== undefined) {
    return `≥ ${bounds.min}`;
  }
  if (bounds.max !== undefined) {
    return `≤ ${bounds.max}`;
  }
  return "Any";
};

export default async function ExpectedVariancesPage({
  params
}: ExpectedVariancePageProps) {
  const { session, user } = await requireUser();
  const client = await prisma.client.findFirst({
    where: {
      id: params.clientId,
      firmId: session.firmId
    }
  });

  if (!client) {
    notFound();
  }

  const variances = await prisma.expectedVariance.findMany({
    where: {
      firmId: session.firmId,
      clientId: client.id
    },
    include: {
      createdByUser: true
    },
    orderBy: { createdAt: "desc" }
  });

  const canEdit = user.role === "ADMIN" || user.role === "REVIEWER";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate">Client</p>
          <h1 className="font-display text-3xl font-semibold text-ink">
            {client.name} · Expected variances
          </h1>
          <p className="mt-2 text-sm text-slate">
            Use expected variances to downgrade known, recurring mismatches.
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
          Reviewer approval is required to manage expected variances.
        </div>
      ) : null}

      <div className="rounded-xl border border-slate/20 bg-surface p-6">
        <h2 className="text-sm font-semibold text-ink">Add expected variance</h2>
        <p className="mt-2 text-xs text-slate">
          Variances are applied when a mismatch falls within the bounds below.
        </p>
        <div className="mt-4">
          <ExpectedVarianceForm clientId={client.id} disabled={!canEdit} />
        </div>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface">
        <div className="border-b border-slate/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Existing variances</h2>
        </div>
        <div className="px-4 py-4">
          {variances.length === 0 ? (
            <p className="text-sm text-slate">No expected variances yet.</p>
          ) : (
            <div className="space-y-4">
              {variances.map((variance) => {
                const condition = variance.condition as
                  | {
                      amountBounds?: { min?: number; max?: number };
                      pctBounds?: { min?: number; max?: number };
                      payeeContains?: string;
                      referenceContains?: string;
                    }
                  | null;
                const effect = variance.effect as
                  | {
                      downgradeTo?: string;
                      requiresNote?: boolean;
                      requiresAttachment?: boolean;
                      requiresReviewerAck?: boolean;
                    }
                  | null;

                return (
                  <div
                    key={variance.id}
                    className="rounded-lg border border-slate/20 bg-surface-muted p-4 text-xs text-slate"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">
                          {varianceLabels[variance.varianceType] ?? variance.varianceType}
                        </p>
                        <p className="mt-1 text-[11px] text-slate">
                          Applies to{" "}
                          {variance.checkType
                            ? checkLabels[variance.checkType]
                            : "all checks"}
                        </p>
                        <p className="mt-1 text-[11px] text-slate">
                          Created by {variance.createdByUser.email} ·{" "}
                          {variance.createdAt.toLocaleDateString("en-GB")}
                        </p>
                      </div>
                      <span className="rounded-full border border-slate/30 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate">
                        {variance.active ? "Active" : "Archived"}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate">
                          Conditions
                        </p>
                        <ul className="mt-2 space-y-1 text-[11px] text-slate">
                          <li>Amount bounds: {formatBounds(condition?.amountBounds)}</li>
                          <li>Percent bounds: {formatBounds(condition?.pctBounds)}</li>
                          {condition?.payeeContains ? (
                            <li>Payee contains: {condition.payeeContains}</li>
                          ) : null}
                          {condition?.referenceContains ? (
                            <li>Reference contains: {condition.referenceContains}</li>
                          ) : null}
                        </ul>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate">
                          Effect
                        </p>
                        <ul className="mt-2 space-y-1 text-[11px] text-slate">
                          <li>
                            Downgrade to: {effect?.downgradeTo ?? "WARN"}
                          </li>
                          <li>
                            Requires note: {effect?.requiresNote ? "Yes" : "No"}
                          </li>
                          <li>
                            Requires attachment:{" "}
                            {effect?.requiresAttachment ? "Yes" : "No"}
                          </li>
                          <li>
                            Reviewer acknowledgment:{" "}
                            {effect?.requiresReviewerAck ? "Yes" : "No"}
                          </li>
                        </ul>
                      </div>
                    </div>

                    {variance.active ? (
                      <form
                        action={archiveExpectedVarianceAction}
                        className="mt-3 flex justify-end"
                      >
                        <input type="hidden" name="varianceId" value={variance.id} />
                        <button
                          type="submit"
                          disabled={!canEdit}
                          className="rounded-lg border border-slate/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate hover:border-slate/60 disabled:opacity-50"
                        >
                          Archive
                        </button>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
