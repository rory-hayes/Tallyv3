"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { AccountClass } from "@/lib/prisma";
import {
  upsertAccountClassificationAction,
  type AccountClassificationFormState
} from "./actions";

const initialState: AccountClassificationFormState = {};

const SubmitButton = () => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Saving..." : "Save"}
    </button>
  );
};

const classificationOptions: Array<{ value: AccountClass; label: string }> = [
  { value: "EXPENSE", label: "Expense" },
  { value: "NET_PAYABLE", label: "Net wages payable" },
  { value: "TAX_PAYABLE", label: "Tax payable" },
  { value: "NI_PRSI_PAYABLE", label: "NI/PRSI payable" },
  { value: "PENSION_PAYABLE", label: "Pension payable" },
  { value: "CASH", label: "Cash/Bank" },
  { value: "OTHER", label: "Other" }
];

export const AccountClassificationForm = ({ clientId }: { clientId: string }) => {
  const [state, formAction] = useFormState(upsertAccountClassificationAction, initialState);

  return (
    <div className="space-y-3">
      <form action={formAction} className="grid gap-3 md:grid-cols-[1.5fr_2fr_1.5fr_auto]">
        <input type="hidden" name="clientId" value={clientId} />
        <input
          name="accountCode"
          type="text"
          placeholder="Account code"
          required
          className="w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
        />
        <input
          name="accountName"
          type="text"
          placeholder="Account name (optional)"
          className="w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
        />
        <select
          name="classification"
          className="w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          defaultValue="EXPENSE"
        >
          {classificationOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <SubmitButton />
      </form>
      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
    </div>
  );
};
