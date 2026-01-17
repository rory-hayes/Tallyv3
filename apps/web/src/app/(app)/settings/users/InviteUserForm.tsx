"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createInviteAction, type InviteState } from "./actions";

const initialState: InviteState = {};

const SubmitButton = () => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Inviting..." : "Invite"}
    </button>
  );
};

export const InviteUserForm = () => {
  const [state, formAction] = useFormState(createInviteAction, initialState);

  return (
    <div className="space-y-4">
      <form action={formAction} className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
        <input
          name="email"
          type="email"
          placeholder="name@firm.com"
          required
          className="w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
        />
        <select
          name="role"
          className="w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          defaultValue="PREPARER"
        >
          <option value="ADMIN">Admin</option>
          <option value="PREPARER">Preparer</option>
          <option value="REVIEWER">Reviewer</option>
        </select>
        <SubmitButton />
      </form>
      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.inviteLink ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Invite ready: <span className="break-all">{state.inviteLink}</span>
        </div>
      ) : null}
    </div>
  );
};
