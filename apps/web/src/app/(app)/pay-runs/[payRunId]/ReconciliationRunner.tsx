"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ReconciliationRunnerProps = {
  payRunId: string;
  disabled?: boolean;
  isReconciling?: boolean;
};

export const ReconciliationRunner = ({
  payRunId,
  disabled,
  isReconciling
}: ReconciliationRunnerProps) => {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const pollJobStatus = async (jobId: string) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const response = await fetch(`/api/jobs/${jobId}`);
      if (!response.ok) {
        continue;
      }
      const data = await response.json();
      if (data.status === "SUCCEEDED") {
        return;
      }
      if (data.status === "FAILED") {
        throw new Error(data.lastError || "Reconciliation failed.");
      }
    }
    throw new Error("Reconciliation is still running. Refresh to view status.");
  };

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/reconciliation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payRunId })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to run reconciliation.");
      }
      if (!data.jobId) {
        throw new Error("Reconciliation job was not queued.");
      }
      setStatus("Reconciliation queued.");
      await pollJobStatus(data.jobId);
      setStatus("Reconciliation completed.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to run reconciliation.");
    } finally {
      setRunning(false);
    }
  };

  const isDisabled = disabled || running || isReconciling;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleRun}
        disabled={isDisabled}
        className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
      >
        {isReconciling
          ? "Reconciling..."
          : running
            ? "Running..."
            : "Run reconciliation"}
      </button>
      {status ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {disabled && !isReconciling ? (
        <p className="text-xs text-rose-600">Reconciliation is disabled.</p>
      ) : null}
    </div>
  );
};
