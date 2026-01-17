"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateTemplateStatusAction, type TemplateStatusState } from "./actions";

type TemplateStatusActionsProps = {
  templateId: string;
  currentStatus: "DRAFT" | "ACTIVE" | "DEPRECATED";
  canManage: boolean;
};

const initialState: TemplateStatusState = {};

const StatusButton = ({
  label,
  value,
  disabled,
  variant
}: {
  label: string;
  value: "ACTIVE" | "DEPRECATED";
  disabled: boolean;
  variant: "primary" | "secondary";
}) => {
  const { pending } = useFormStatus();
  const baseClasses =
    variant === "primary"
      ? "rounded-lg bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
      : "rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate";

  return (
    <button
      type="submit"
      name="status"
      value={value}
      disabled={disabled || pending}
      className={`${baseClasses} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {pending ? "Updating..." : label}
    </button>
  );
};

export const TemplateStatusActions = ({
  templateId,
  currentStatus,
  canManage
}: TemplateStatusActionsProps) => {
  const [state, formAction] = useFormState(updateTemplateStatusAction, initialState);

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="templateId" value={templateId} />
        <StatusButton
          label="Set active"
          value="ACTIVE"
          variant="primary"
          disabled={!canManage || currentStatus === "ACTIVE"}
        />
        <StatusButton
          label="Deprecate"
          value="DEPRECATED"
          variant="secondary"
          disabled={!canManage || currentStatus === "DEPRECATED"}
        />
      </form>
      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      ) : null}
      {!canManage ? (
        <p className="text-xs text-slate">Only admins or preparers can change status.</p>
      ) : null}
    </div>
  );
};
