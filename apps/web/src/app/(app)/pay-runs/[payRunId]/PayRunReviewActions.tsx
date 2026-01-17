"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PayRunStatus, Role, SourceType } from "@tally/db";
import type { ReviewGateResult } from "@/lib/pay-run-review";

type PayRunReviewActionsProps = {
  payRunId: string;
  status: PayRunStatus;
  role: Role;
  gate: ReviewGateResult;
  latestApproval?: {
    status: "APPROVED" | "REJECTED";
    comment: string | null;
    createdAt: string;
    reviewerEmail: string;
  } | null;
};

const sourceLabels: Record<SourceType, string> = {
  REGISTER: "Register",
  BANK: "Bank / Payments",
  GL: "GL Journal",
  STATUTORY: "Statutory Totals"
};

const formatSources = (sources: SourceType[]) =>
  sources.map((source) => sourceLabels[source]).join(", ");

export const PayRunReviewActions = ({
  payRunId,
  status,
  role,
  gate,
  latestApproval
}: PayRunReviewActionsProps) => {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const canSubmit = status === "RECONCILED" && (role === "ADMIN" || role === "PREPARER");
  const canReview = status === "READY_FOR_REVIEW" && (role === "ADMIN" || role === "REVIEWER");
  const hasBlockingIssues =
    gate.missingSources.length > 0 ||
    gate.unmappedSources.length > 0 ||
    gate.openCriticalCount > 0;

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
        throw new Error(data.error || "Unable to update pay run.");
      }
      setStatusMessage(successMessage);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update pay run.");
    } finally {
      setPendingAction(null);
    }
  };

  const handleSubmit = async () => {
    await postAction(
      "submit",
      "/api/pay-runs/submit-review",
      { payRunId },
      "Submitted for review."
    );
  };

  const handleApprove = async () => {
    await postAction(
      "approve",
      "/api/pay-runs/approve",
      { payRunId, comment: comment.trim() || null },
      "Pay run approved."
    );
  };

  const handleReject = async () => {
    if (comment.trim().length < 2) {
      setError("Rejection comment is required.");
      return;
    }
    await postAction(
      "reject",
      "/api/pay-runs/reject",
      { payRunId, comment },
      "Pay run sent back for updates."
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate/20 bg-surface-muted px-4 py-3 text-sm text-slate">
        Status: <span className="font-semibold text-ink">{status}</span>
      </div>

      {hasBlockingIssues ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          <p className="font-semibold">Review gate not met.</p>
          {gate.missingSources.length > 0 ? (
            <p>Missing sources: {formatSources(gate.missingSources)}.</p>
          ) : null}
          {gate.unmappedSources.length > 0 ? (
            <p>Mapping required for: {formatSources(gate.unmappedSources)}.</p>
          ) : null}
          {gate.openCriticalCount > 0 ? (
            <p>Critical exceptions open: {gate.openCriticalCount}.</p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
          All required sources are mapped. Ready for review.
        </div>
      )}

      {gate.openExceptionCount > 0 ? (
        <p className="text-xs text-amber-700">
          Open exceptions: {gate.openExceptionCount}. Resolve or dismiss before
          approval.
        </p>
      ) : null}

      {latestApproval ? (
        <div className="rounded-lg border border-slate/20 bg-surface-muted px-4 py-3 text-xs text-slate">
          <p className="font-semibold text-ink">
            Latest decision: {latestApproval.status}
          </p>
          <p className="mt-1">
            {latestApproval.reviewerEmail} ·{" "}
            {new Date(latestApproval.createdAt).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short"
            })}
          </p>
          {latestApproval.comment ? (
            <p className="mt-2 text-ink">{latestApproval.comment}</p>
          ) : null}
        </div>
      ) : null}

      {canSubmit ? (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pendingAction === "submit"}
          className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {pendingAction === "submit" ? "Submitting..." : "Submit for review"}
        </button>
      ) : null}

      {canReview ? (
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Reviewer note (optional)
          </label>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
            placeholder="Optional note for approval/rejection."
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={pendingAction !== null}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
            >
              {pendingAction === "approve" ? "Saving..." : "Approve"}
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={pendingAction !== null}
              className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rose-700 disabled:opacity-50"
            >
              {pendingAction === "reject" ? "Saving..." : "Reject"}
            </button>
          </div>
        </div>
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
