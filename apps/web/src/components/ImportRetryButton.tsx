"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ImportRetryButtonProps = {
  importId: string;
  disabled?: boolean;
};

export const ImportRetryButton = ({
  importId,
  disabled = false
}: ImportRetryButtonProps) => {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRetry = async () => {
    if (disabled) {
      return;
    }
    setIsRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/imports/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importId })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to retry parsing.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to retry parsing.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      <button
        type="button"
        onClick={handleRetry}
        disabled={disabled || isRunning}
        className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-700 disabled:opacity-50"
      >
        {isRunning ? "Retrying..." : "Retry parse"}
      </button>
      {error ? (
        <p className="text-xs text-rose-700">{error}</p>
      ) : null}
    </div>
  );
};
