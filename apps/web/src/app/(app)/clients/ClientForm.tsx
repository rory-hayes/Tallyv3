"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { PayrollFrequency, PayrollSystem, Role } from "@tally/db";
import type { ClientFormState } from "./actions";

type ReviewerOption = {
  id: string;
  email: string;
  role: Role;
};

type ClientFormValues = {
  clientId?: string;
  name?: string;
  payrollSystem?: PayrollSystem;
  payrollSystemOther?: string | null;
  payrollFrequency?: PayrollFrequency;
  defaultReviewerUserId?: string | null;
};

type ClientFormProps = {
  reviewers: ReviewerOption[];
  action: (
    prevState: ClientFormState,
    formData: FormData
  ) => Promise<ClientFormState>;
  submitLabel: string;
  values?: ClientFormValues;
};

const payrollSystems: Array<{ value: PayrollSystem; label: string }> = [
  { value: "BRIGHTPAY", label: "BrightPay" },
  { value: "STAFFOLOGY", label: "Staffology" },
  { value: "OTHER", label: "Other" }
];

const payrollFrequencies: Array<{ value: PayrollFrequency; label: string }> = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "FORTNIGHTLY", label: "Fortnightly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "OTHER", label: "Other" }
];

const SubmitButton = ({ label }: { label: string }) => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Saving..." : label}
    </button>
  );
};

export const ClientForm = ({ reviewers, action, submitLabel, values }: ClientFormProps) => {
  const [state, formAction] = useFormState(action, {});
  const initialSystem = values?.payrollSystem ?? "BRIGHTPAY";
  const [system, setSystem] = useState<PayrollSystem>(initialSystem);

  const reviewerOptions = useMemo(
    () =>
      reviewers.map((reviewer) => ({
        value: reviewer.id,
        label: `${reviewer.email} (${reviewer.role.toLowerCase()})`
      })),
    [reviewers]
  );

  return (
    <form action={formAction} className="space-y-4">
      {values?.clientId ? (
        <input type="hidden" name="clientId" value={values.clientId} />
      ) : null}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate">
          Client name
        </label>
        <input
          name="name"
          type="text"
          required
          defaultValue={values?.name ?? ""}
          className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Payroll system
          </label>
          <select
            name="payrollSystem"
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
            defaultValue={initialSystem}
            onChange={(event) => setSystem(event.target.value as PayrollSystem)}
          >
            {payrollSystems.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Payroll frequency
          </label>
          <select
            name="payrollFrequency"
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
            defaultValue={values?.payrollFrequency ?? "MONTHLY"}
          >
            {payrollFrequencies.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {system === "OTHER" ? (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Payroll system name
          </label>
          <input
            name="payrollSystemOther"
            type="text"
            defaultValue={values?.payrollSystemOther ?? ""}
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          />
        </div>
      ) : null}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate">
          Default reviewer (optional)
        </label>
        <select
          name="defaultReviewerUserId"
          className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          defaultValue={values?.defaultReviewerUserId ?? ""}
        >
          <option value="">No default reviewer</option>
          {reviewerOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <SubmitButton label={submitLabel} />
    </form>
  );
};
