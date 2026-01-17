"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createFirmAction, type CreateFirmState } from "./actions";

const initialState: CreateFirmState = {};

const SubmitButton = () => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Creating..." : "Create workspace"}
    </button>
  );
};

export const CreateFirmForm = () => {
  const [state, formAction] = useFormState(createFirmAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate">
          Firm name
        </label>
        <input
          name="firmName"
          type="text"
          required
          className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Region
          </label>
          <select
            name="region"
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
            defaultValue="UK"
          >
            <option value="UK">United Kingdom</option>
            <option value="IE">Ireland</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Timezone
          </label>
          <select
            name="timezone"
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
            defaultValue="Europe/London"
          >
            <option value="Europe/London">Europe/London</option>
            <option value="Europe/Dublin">Europe/Dublin</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate">
          Admin email
        </label>
        <input
          name="email"
          type="email"
          required
          className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate">
          Password (min 12 characters)
        </label>
        <input
          name="password"
          type="password"
          required
          minLength={12}
          className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
        />
      </div>
      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
};
