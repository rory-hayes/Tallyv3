"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { CheckType, ExpectedVarianceType } from "@/lib/prisma";
import {
  createExpectedVarianceAction,
  type ExpectedVarianceFormState
} from "./actions";

const initialState: ExpectedVarianceFormState = {};

const checkTypeOptions: Array<{ value: CheckType; label: string }> = [
  { value: "CHK_REGISTER_NET_TO_BANK_TOTAL", label: "Register vs Bank totals" },
  { value: "CHK_JOURNAL_DEBITS_EQUAL_CREDITS", label: "Journal balance" },
  { value: "CHK_REGISTER_DEDUCTIONS_TO_STATUTORY_TOTALS", label: "Register vs Statutory totals" },
  { value: "CHK_REGISTER_GROSS_TO_JOURNAL_EXPENSE", label: "Register gross vs Journal expense" },
  {
    value: "CHK_REGISTER_EMPLOYER_COSTS_TO_JOURNAL_EXPENSE",
    label: "Register employer costs vs Journal"
  },
  {
    value: "CHK_REGISTER_NET_PAY_TO_JOURNAL_LIABILITY",
    label: "Register net pay vs Journal liability"
  },
  {
    value: "CHK_REGISTER_TAX_TO_JOURNAL_LIABILITY",
    label: "Register tax vs Journal liability"
  },
  {
    value: "CHK_REGISTER_PENSION_TO_JOURNAL_LIABILITY",
    label: "Register pension vs Journal liability"
  },
  {
    value: "CHK_REGISTER_PENSION_TO_PENSION_SCHEDULE",
    label: "Register pension vs Pension schedule"
  },
  { value: "CHK_BANK_DUPLICATE_PAYMENTS", label: "Bank duplicate payments" },
  { value: "CHK_BANK_NEGATIVE_PAYMENTS", label: "Bank negative payments" },
  { value: "CHK_BANK_PAYMENT_COUNT_MISMATCH", label: "Bank payment count mismatch" }
];

const varianceTypeOptions: Array<{ value: ExpectedVarianceType; label: string }> = [
  { value: "DIRECTORS_SEPARATE", label: "Directors paid separately" },
  { value: "PENSION_SEPARATE", label: "Pension paid separately" },
  { value: "ROUNDING", label: "Rounding differences" },
  { value: "OTHER", label: "Other" }
];

const SubmitButton = ({ disabled }: { disabled?: boolean }) => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Saving..." : "Add variance"}
    </button>
  );
};

export const ExpectedVarianceForm = ({
  clientId,
  disabled
}: {
  clientId: string;
  disabled?: boolean;
}) => {
  const [state, formAction] = useFormState(createExpectedVarianceAction, initialState);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="clientId" value={clientId} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Variance type
            <select
              name="varianceType"
              defaultValue="ROUNDING"
              disabled={disabled}
              className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {varianceTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Applies to check
            <select
              name="checkType"
              defaultValue=""
              disabled={disabled}
              className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              <option value="">All checks</option>
              {checkTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Amount min
            <input
              name="amountMin"
              type="number"
              step="0.01"
              min="0"
              disabled={disabled}
              className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Amount max
            <input
              name="amountMax"
              type="number"
              step="0.01"
              min="0"
              disabled={disabled}
              className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Percent min
            <input
              name="percentMin"
              type="number"
              step="0.01"
              min="0"
              disabled={disabled}
              className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Percent max
            <input
              name="percentMax"
              type="number"
              step="0.01"
              min="0"
              disabled={disabled}
              className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Payee contains
            <input
              name="payeeContains"
              type="text"
              disabled={disabled}
              className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Reference contains
            <input
              name="referenceContains"
              type="text"
              disabled={disabled}
              className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </label>
        </div>
        <p className="text-xs text-slate">
          Add at least one condition so the variance only applies to matching
          mismatches.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Downgrade to
            <select
              name="downgradeTo"
              defaultValue="WARN"
              disabled={disabled}
              className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              <option value="WARN">Warn</option>
              <option value="PASS">Pass</option>
            </select>
          </label>
          <div className="flex flex-col gap-2 text-xs text-slate">
            <label className="flex items-center gap-2">
              <input
                name="requiresNote"
                type="checkbox"
                disabled={disabled}
                className="h-4 w-4 rounded border-slate/40"
              />
              Require note when variance is used
            </label>
            <label className="flex items-center gap-2">
              <input
                name="requiresAttachment"
                type="checkbox"
                disabled={disabled}
                className="h-4 w-4 rounded border-slate/40"
              />
              Require attachment
            </label>
            <label className="flex items-center gap-2">
              <input
                name="requiresReviewerAck"
                type="checkbox"
                disabled={disabled}
                className="h-4 w-4 rounded border-slate/40"
              />
              Require reviewer acknowledgment
            </label>
          </div>
        </div>

        <SubmitButton disabled={disabled} />
      </form>

      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
    </div>
  );
};
