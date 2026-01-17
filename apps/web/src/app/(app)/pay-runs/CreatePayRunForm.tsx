"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { PayRunFormState } from "./actions";
import { createPayRunAction } from "./actions";

type ClientOption = {
  id: string;
  name: string;
};

type CreatePayRunFormProps = {
  clients: ClientOption[];
  defaultClientId?: string;
};

const SubmitButton = () => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Creating..." : "Create pay run"}
    </button>
  );
};

export const CreatePayRunForm = ({ clients, defaultClientId }: CreatePayRunFormProps) => {
  const [state, formAction] = useFormState<PayRunFormState, FormData>(
    createPayRunAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate">
          Client
        </label>
        <select
          name="clientId"
          className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          defaultValue={defaultClientId ?? ""}
          required
        >
          <option value="" disabled>
            Select client
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Period start
          </label>
          <input
            name="periodStart"
            type="date"
            required
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Period end
          </label>
          <input
            name="periodEnd"
            type="date"
            required
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          />
        </div>
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
