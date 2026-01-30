"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ImportDeleteButtonProps = {
  importId: string;
  disabled?: boolean;
};

export const ImportDeleteButton = ({
  importId,
  disabled = false
}: ImportDeleteButtonProps) => {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (disabled || isRunning) {
      return;
    }
    const confirmed = window.confirm(
      "Void this import? This hides the upload and requires a new upload to replace it."
    );
    if (!confirmed) {
      return;
    }
    setIsRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/imports/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importId })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to delete import.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete import.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      <button
        type="button"
        onClick={handleDelete}
        disabled={disabled || isRunning}
        className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-rose-700 disabled:opacity-50"
      >
        {isRunning ? "Voiding..." : "Void import"}
      </button>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
};
