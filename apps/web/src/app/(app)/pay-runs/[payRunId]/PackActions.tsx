"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PayRunStatus, Role } from "@tally/db";

type PackSummary = {
  id: string;
  packVersion: number;
  generatedAt: string;
  lockedAt: string | null;
  downloadUrl: string | null;
};

type PackActionsProps = {
  payRunId: string;
  status: PayRunStatus;
  role: Role;
  pack: PackSummary | null;
};

export const PackActions = ({ payRunId, status, role, pack }: PackActionsProps) => {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const canGenerate = status === "APPROVED";
  const canLock = status === "PACKED" && (role === "ADMIN" || role === "REVIEWER");

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
        throw new Error(data.error || "Unable to update pack.");
      }
      setStatusMessage(successMessage);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update pack.");
    } finally {
      setPendingAction(null);
    }
  };

  const handleGenerate = async () => {
    await postAction(
      "generate",
      "/api/packs/generate",
      { payRunId },
      "Pack generated."
    );
  };

  const handleLock = async () => {
    await postAction(
      "lock",
      "/api/packs/lock",
      { payRunId },
      "Pack locked."
    );
  };

  return (
    <div className="space-y-4">
      {pack ? (
        <div className="rounded-lg border border-slate/20 bg-surface-muted px-4 py-3 text-xs text-slate">
          <p className="font-semibold text-ink">Pack v{pack.packVersion}</p>
          <p className="mt-1">
            Generated:{" "}
            {new Date(pack.generatedAt).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short"
            })}
          </p>
          {pack.lockedAt ? (
            <p className="mt-1">
              Locked:{" "}
              {new Date(pack.lockedAt).toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short"
              })}
            </p>
          ) : null}
          {pack.downloadUrl ? (
            <a
              href={pack.downloadUrl}
              className="mt-2 inline-flex text-xs font-semibold uppercase tracking-wide text-accent hover:text-accent-strong"
            >
              Download pack
            </a>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-slate">No pack generated yet.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate || pendingAction !== null}
          className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {pendingAction === "generate" ? "Generating..." : "Generate pack"}
        </button>
        <button
          type="button"
          onClick={handleLock}
          disabled={!canLock || pendingAction !== null}
          className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate disabled:opacity-50"
        >
          {pendingAction === "lock" ? "Locking..." : "Lock pack"}
        </button>
      </div>

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
      {!canLock && status === "PACKED" ? (
        <p className="text-xs text-slate">
          Reviewer approval is required to lock packs.
        </p>
      ) : null}
    </div>
  );
};
