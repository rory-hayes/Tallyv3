"use client";

import { useFormState, useFormStatus } from "react-dom";
import { acceptInviteAction, type AcceptInviteState } from "./actions";

const initialState: AcceptInviteState = {};

const SubmitButton = () => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Activating..." : "Activate account"}
    </button>
  );
};

export const AcceptInviteForm = ({ token }: { token: string }) => {
  const boundAction = acceptInviteAction.bind(null, token);
  const [state, formAction] = useFormState(boundAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate">
          Create password
        </label>
        <input
          name="password"
          type="password"
          minLength={12}
          required
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
