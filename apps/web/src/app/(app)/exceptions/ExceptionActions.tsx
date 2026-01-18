"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ExceptionStatus, Role } from "@/lib/prisma";

type ExceptionActionsProps = {
  exceptionId: string;
  status: ExceptionStatus;
  assignedToUserId: string | null;
  users: Array<{ id: string; email: string }>;
  role: Role;
};

export const ExceptionActions = ({
  exceptionId,
  status,
  assignedToUserId,
  users,
  role
}: ExceptionActionsProps) => {
  const router = useRouter();
  const [assignee, setAssignee] = useState(assignedToUserId ?? "");
  const [note, setNote] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const canEdit = status === "OPEN";
  const canOverride = canEdit && (role === "ADMIN" || role === "REVIEWER");

  const postAction = async (
    action: string,
    endpoint: string,
    payload: Record<string, unknown>,
    successMessage: string
  ) => {
    setPendingAction(action);
    setError(null);
    setStatusMessage(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to update exception.");
      }
      setStatusMessage(successMessage);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update exception.");
    } finally {
      setPendingAction(null);
    }
  };

  const handleAssign = async () => {
    await postAction(
      "assign",
      "/api/exceptions/assign",
      {
        exceptionId,
        assignedToUserId: assignee ? assignee : null
      },
      assignee ? "Assignee updated." : "Exception unassigned."
    );
  };

  const handleResolve = async () => {
    if (note.trim().length < 2) {
      setError("Resolution note is required.");
      return;
    }
    await postAction(
      "resolve",
      "/api/exceptions/resolve",
      { exceptionId, note },
      "Exception resolved."
    );
  };

  const handleDismiss = async () => {
    if (note.trim().length < 2) {
      setError("Dismissal note is required.");
      return;
    }
    await postAction(
      "dismiss",
      "/api/exceptions/dismiss",
      { exceptionId, note },
      "Exception dismissed."
    );
  };

  const handleOverride = async () => {
    if (note.trim().length < 2) {
      setError("Override note is required.");
      return;
    }
    await postAction(
      "override",
      "/api/exceptions/override",
      { exceptionId, note },
      "Exception overridden."
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate">
          Assign to
        </label>
        <div className="mt-2 flex gap-2">
          <select
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
            disabled={!canEdit || pendingAction === "assign"}
            className="w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          >
            <option value="">Unassigned</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAssign}
            disabled={!canEdit || pendingAction === "assign"}
            className="rounded-lg border border-slate/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate disabled:opacity-50"
          >
            {pendingAction === "assign" ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate">
          Resolution note
        </label>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          disabled={!canEdit || pendingAction !== null}
          className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          placeholder="Add a short resolution note..."
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleResolve}
          disabled={!canEdit || pendingAction !== null}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {pendingAction === "resolve" ? "Saving..." : "Resolve"}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={!canEdit || pendingAction !== null}
          className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rose-700 disabled:opacity-50"
        >
          {pendingAction === "dismiss" ? "Saving..." : "Dismiss"}
        </button>
        <button
          type="button"
          onClick={handleOverride}
          disabled={!canOverride || pendingAction !== null}
          className="rounded-lg border border-amber-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-amber-700 disabled:opacity-50"
        >
          {pendingAction === "override" ? "Saving..." : "Override"}
        </button>
      </div>

      {!canEdit ? (
        <p className="text-xs text-slate">
          Only open exceptions can be updated.
        </p>
      ) : null}
      {!canOverride && canEdit ? (
        <p className="text-xs text-slate">
          Reviewer approval is required to override exceptions.
        </p>
      ) : null}

      {statusMessage ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {statusMessage}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
};
