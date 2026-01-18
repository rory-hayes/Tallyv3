import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import type { CheckDetails, EvidencePointer } from "@/lib/reconciliation-checks";
import { ExceptionActions } from "../ExceptionActions";

type ExceptionDetailPageProps = {
  params: { exceptionId: string };
};

const formatNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return "-";
  }
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return "-";
  }
  return `${value.toFixed(2)}%`;
};

export default async function ExceptionDetailPage({
  params
}: ExceptionDetailPageProps) {
  const { session, user } = await requireUser();

  const exception = await prisma.exception.findFirst({
    where: {
      id: params.exceptionId,
      firmId: session.firmId
    },
    include: {
      payRun: { include: { client: true } },
      checkResult: true,
      assignedToUser: true,
      resolvedByUser: true
    }
  });

  if (!exception) {
    notFound();
  }

  const users = await prisma.user.findMany({
    where: {
      firmId: session.firmId,
      status: "ACTIVE"
    },
    select: {
      id: true,
      email: true
    },
    orderBy: { email: "asc" }
  });

  const details = exception.checkResult.details as CheckDetails;
  const rawEvidence = Array.isArray(exception.evidence)
    ? exception.evidence
    : Array.isArray(exception.checkResult.evidence)
      ? exception.checkResult.evidence
      : [];
  const evidence = rawEvidence as EvidencePointer[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate">
            Exception
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink">
            {exception.title}
          </h1>
          <p className="mt-2 text-sm text-slate">{exception.description}</p>
        </div>
        <Link
          href={`/pay-runs/${exception.payRunId}` as Route}
          className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
        >
          View pay run
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-xl border border-slate/20 bg-surface p-6">
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate">
              <span className="rounded-full border border-slate/30 px-3 py-1">
                {exception.category}
              </span>
              <span className="rounded-full border border-slate/30 px-3 py-1">
                {exception.severity}
              </span>
              <span className="rounded-full border border-slate/30 px-3 py-1">
                {exception.status}
              </span>
            </div>

            <div className="mt-6 space-y-3 text-sm text-slate">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                Formula
              </p>
              <p className="text-ink">{details.formula}</p>
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border border-slate/20">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate/20 uppercase tracking-[0.2em] text-slate">
                  <tr>
                    <th className="px-4 py-3">Metric</th>
                    <th className="px-4 py-3">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate/10">
                    <td className="px-4 py-3 font-semibold text-ink">
                      {details.leftLabel}
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {formatNumber(details.leftValue)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate/10">
                    <td className="px-4 py-3 font-semibold text-ink">
                      {details.rightLabel}
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {formatNumber(details.rightValue)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate/10">
                    <td className="px-4 py-3 font-semibold text-ink">Delta</td>
                    <td className="px-4 py-3 text-slate">
                      {formatNumber(details.deltaValue)} ·{" "}
                      {formatPercent(details.deltaPercent)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-semibold text-ink">Tolerance</td>
                    <td className="px-4 py-3 text-slate">
                      ±{formatNumber(details.toleranceApplied?.applied)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate/20 bg-surface p-6">
            <h2 className="text-sm font-semibold text-ink">Evidence</h2>
            {evidence.length === 0 ? (
              <p className="mt-3 text-sm text-slate">
                No evidence pointers were recorded.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {evidence.map((item, index) => (
                  <div
                    key={`${item.importId}-${index}`}
                    className="rounded-lg border border-slate/20 bg-surface-muted px-4 py-3 text-xs text-slate"
                  >
                    <p className="font-semibold text-ink">
                      Import {item.importId}
                    </p>
                    <p className="mt-1">
                      Rows: {item.rowNumbers.join(", ") || "None"}
                    </p>
                    {item.note ? <p className="mt-1">{item.note}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-slate/20 bg-surface p-6 text-sm">
            <h2 className="text-sm font-semibold text-ink">Resolution</h2>
            <div className="mt-4 space-y-2 text-slate">
              <p>Status: {exception.status}</p>
              <p>
                Assigned to: {exception.assignedToUser?.email ?? "Unassigned"}
              </p>
              {exception.resolvedByUser ? (
                <p>Resolved by: {exception.resolvedByUser.email}</p>
              ) : null}
              {exception.resolvedAt ? (
                <p>
                  Resolved at:{" "}
                  {exception.resolvedAt.toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short"
                  })}
                </p>
              ) : null}
              {exception.resolutionNote ? (
                <p className="rounded-lg border border-slate/20 bg-surface-muted px-3 py-2 text-xs text-ink">
                  {exception.resolutionNote}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-slate/20 bg-surface p-6">
            <h2 className="text-sm font-semibold text-ink">Actions</h2>
            <div className="mt-4">
              <ExceptionActions
                exceptionId={exception.id}
                status={exception.status}
                assignedToUserId={exception.assignedToUserId}
                users={users}
                role={user.role}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
