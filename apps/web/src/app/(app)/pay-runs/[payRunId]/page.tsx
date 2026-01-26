import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import {
  prisma,
  type ImportStatus,
  type SourceType
} from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getReviewGateStatus } from "@/lib/pay-run-review";
import { derivePayRunStatus, getOpenExceptionCounts } from "@/lib/pay-run-exceptions";
import { ImportUploader } from "./ImportUploader";
import { ReconciliationRunner } from "./ReconciliationRunner";
import { PayRunReviewActions } from "./PayRunReviewActions";
import { PackActions } from "./PackActions";
import { ImportRetryButton } from "@/components/ImportRetryButton";

export const dynamic = "force-dynamic";

type PayRunDetailPageProps = {
  params: { payRunId: string };
};

const badgeBase =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

const importStatusLabels: Record<ImportStatus, string> = {
  UPLOADED: "Uploaded",
  PARSING: "Parsing",
  PARSED: "Parsed",
  MAPPING_REQUIRED: "Mapping required",
  MAPPED: "Mapped",
  READY: "Ready",
  ERROR_FILE_INVALID: "File invalid",
  ERROR_PARSE_FAILED: "Parse failed"
};

const importStatusBadgeClasses: Record<ImportStatus, string> = {
  UPLOADED: "bg-slate-100 text-slate-700",
  PARSING: "bg-amber-100 text-amber-700",
  PARSED: "bg-sky-100 text-sky-700",
  MAPPING_REQUIRED: "bg-amber-100 text-amber-700",
  MAPPED: "bg-blue-100 text-blue-700",
  READY: "bg-emerald-100 text-emerald-700",
  ERROR_FILE_INVALID: "bg-rose-100 text-rose-700",
  ERROR_PARSE_FAILED: "bg-rose-100 text-rose-700"
};

type ReconStatus = "NOT_RUN" | "RUNNING" | "SUCCESS" | "FAILED";

const reconStatusLabels: Record<ReconStatus, string> = {
  NOT_RUN: "Not run",
  RUNNING: "Running",
  SUCCESS: "Success",
  FAILED: "Failed"
};

const reconStatusBadgeClasses: Record<ReconStatus, string> = {
  NOT_RUN: "bg-slate-100 text-slate-700",
  RUNNING: "bg-amber-100 text-amber-700",
  SUCCESS: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-rose-100 text-rose-700"
};

const lockBadgeClasses = {
  locked: "bg-emerald-100 text-emerald-700",
  unlocked: "bg-amber-100 text-amber-700"
};

export default async function PayRunDetailPage({ params }: PayRunDetailPageProps) {
  const { session, user } = await requireUser();
  const payRun = await prisma.payRun.findFirst({
    where: {
      id: params.payRunId,
      firmId: session.firmId
    },
    include: {
      client: true
    }
  });

  if (!payRun) {
    notFound();
  }

  const imports = await prisma.import.findMany({
    where: {
      firmId: session.firmId,
      payRunId: payRun.id
    },
    include: {
      uploadedByUser: true,
      mappingTemplateVersion: true
    },
    orderBy: [{ sourceType: "asc" }, { version: "desc" }]
  });

  const latestRun = await prisma.reconciliationRun.findFirst({
    where: {
      firmId: session.firmId,
      payRunId: payRun.id
    },
    include: {
      checkResults: {
        orderBy: { checkType: "asc" }
      },
      exceptions: true
    },
    orderBy: { runNumber: "desc" }
  });

  const [
    reviewGate,
    latestApproval,
    latestPack,
    openExceptionCounts,
    timelineEvents
  ] = await Promise.all([
    getReviewGateStatus(session.firmId, payRun.id),
    prisma.approval.findFirst({
      where: {
        firmId: session.firmId,
        payRunId: payRun.id
      },
      include: {
        reviewerUser: true
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.pack.findFirst({
      where: {
        firmId: session.firmId,
        payRunId: payRun.id
      },
      orderBy: { packVersion: "desc" }
    }),
    getOpenExceptionCounts(session.firmId, [payRun.id]),
    prisma.auditEvent.findMany({
      where: {
        firmId: session.firmId,
        entityType: "PAY_RUN",
        entityId: payRun.id
      },
      include: {
        actorUser: {
          select: { email: true }
        }
      },
      orderBy: { timestamp: "desc" },
      take: 12
    })
  ]);

  const openExceptionCount = openExceptionCounts.get(payRun.id) ?? 0;
  const displayStatus = derivePayRunStatus(payRun.status, openExceptionCount);

  const packDownloadUrl = latestPack
    ? `/packs/${latestPack.id}/download`
    : null;

  const importsBySource = imports.reduce<Record<SourceType, typeof imports>>(
    (acc, entry) => {
      acc[entry.sourceType] = acc[entry.sourceType]
        ? [...acc[entry.sourceType], entry]
        : [entry];
      return acc;
    },
    {
      REGISTER: [],
      BANK: [],
      GL: [],
      STATUTORY: [],
      PENSION_SCHEDULE: []
    }
  );

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const sourceLabels: Record<SourceType, string> = {
    REGISTER: "Register",
    BANK: "Bank / Payments",
    GL: "GL Journal",
    STATUTORY: "Statutory Totals",
    PENSION_SCHEDULE: "Pension Schedule"
  };

  const checkLabels: Record<string, string> = {
    CHK_REGISTER_NET_TO_BANK_TOTAL: "Register vs Bank totals",
    CHK_JOURNAL_DEBITS_EQUAL_CREDITS: "Journal balance",
    CHK_REGISTER_DEDUCTIONS_TO_STATUTORY_TOTALS: "Register vs Statutory totals",
    CHK_REGISTER_GROSS_TO_JOURNAL_EXPENSE: "Register gross vs Journal expense",
    CHK_REGISTER_EMPLOYER_COSTS_TO_JOURNAL_EXPENSE: "Register employer costs vs Journal",
    CHK_REGISTER_NET_PAY_TO_JOURNAL_LIABILITY: "Register net pay vs Journal liability",
    CHK_REGISTER_TAX_TO_JOURNAL_LIABILITY: "Register tax vs Journal liability",
    CHK_REGISTER_PENSION_TO_JOURNAL_LIABILITY: "Register pension vs Journal liability",
    CHK_REGISTER_PENSION_TO_PENSION_SCHEDULE: "Register pension vs Pension schedule",
    CHK_BANK_DUPLICATE_PAYMENTS: "Bank duplicate payments",
    CHK_BANK_NEGATIVE_PAYMENTS: "Bank negative payments",
    CHK_BANK_PAYMENT_COUNT_MISMATCH: "Bank payment count"
  };

  const isLocked = payRun.status === "LOCKED" || payRun.status === "ARCHIVED";
  const reconStatus: ReconStatus = latestRun ? latestRun.status : "NOT_RUN";
  const isReconciling =
    reconStatus === "RUNNING" || payRun.status === "RECONCILING";

  const formatNumber = (value: number | null | undefined) => {
    if (value === null || value === undefined) {
      return "-";
    }
    return value.toLocaleString("en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate">Pay run</p>
          <h1 className="font-display text-3xl font-semibold text-ink">
            {payRun.client.name} · {payRun.periodLabel}
          </h1>
          <p className="mt-2 text-sm text-slate">
            Revision {payRun.revision} · {displayStatus}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/clients/${payRun.clientId}` as Route}
            className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
          >
            View client
          </Link>
          <Link
            href={`/pay-runs/${payRun.id}/tolerances` as Route}
            className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
          >
            Tolerances
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface p-6">
        <h2 className="text-sm font-semibold text-ink">Uploads</h2>
        <p className="mt-2 text-sm text-slate">
          Upload the latest exports for each source type. Each upload is versioned
          and immutable.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(Object.keys(sourceLabels) as SourceType[]).map((sourceType) => {
            const latest = importsBySource[sourceType][0];
            return (
              <div
                key={sourceType}
                className="rounded-xl border border-slate/20 bg-surface-muted p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate">
                      {sourceLabels[sourceType]}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                      <span>{latest ? `Version ${latest.version}` : "No uploads yet"}</span>
                      {latest ? (
                        <span
                          className={`${badgeBase} ${importStatusBadgeClasses[latest.parseStatus]}`}
                        >
                          {importStatusLabels[latest.parseStatus]}
                        </span>
                      ) : null}
                    </div>
                    {latest ? (
                      latest.mappingTemplateVersion ? (
                        <p className="mt-1 text-xs text-slate">
                          Template v{latest.mappingTemplateVersion.version}
                        </p>
                      ) : latest.mappingTemplateVersionId ? (
                        <p className="mt-1 text-xs text-slate">Template applied</p>
                      ) : (
                        <p className="mt-1 text-xs text-amber-700">
                          Mapping required
                        </p>
                      )
                    ) : null}
                    {latest &&
                    (latest.parseStatus === "ERROR_FILE_INVALID" ||
                      latest.parseStatus === "ERROR_PARSE_FAILED") ? (
                      <p className="mt-1 text-xs text-rose-700">
                        {latest.errorMessage ?? "Import failed validation."}
                      </p>
                    ) : null}
                    {latest && latest.parseStatus === "ERROR_PARSE_FAILED" ? (
                      <ImportRetryButton
                        importId={latest.id}
                        disabled={isLocked}
                      />
                    ) : null}
                    {latest ? (
                      <p className="mt-1 text-xs text-slate">
                        {latest.originalFilename} · {formatBytes(latest.sizeBytes)}
                      </p>
                    ) : null}
                    {latest && latest.parseSummary ? (
                      <p className="mt-1 text-xs text-slate">
                        Parsed{" "}
                        {(latest.parseSummary as { rowCount?: number }).rowCount ??
                          "-"}{" "}
                        rows ·{" "}
                        {(latest.parseSummary as { columnCount?: number })
                          .columnCount ?? "-"}{" "}
                        columns
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4">
                  <ImportUploader
                    payRunId={payRun.id}
                    sourceType={sourceType}
                    disabled={isLocked}
                  />
                  {latest ? (
                    <Link
                      href={`/imports/${latest.id}/mapping` as Route}
                      className={`mt-3 inline-flex items-center rounded-lg border border-slate/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
                        isLocked
                          ? "cursor-not-allowed text-slate/40"
                          : "text-slate hover:border-slate/60"
                      }`}
                      aria-disabled={isLocked}
                    >
                      Map columns
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Reconciliation</h2>
            <p className="mt-2 text-sm text-slate">
              Run totals-first checks and capture exceptions for this pay run.
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate">
              <span>Status</span>
              <span className={`${badgeBase} ${reconStatusBadgeClasses[reconStatus]}`}>
                {reconStatusLabels[reconStatus]}
              </span>
            </div>
          </div>
          <ReconciliationRunner
            payRunId={payRun.id}
            disabled={isLocked}
            isReconciling={isReconciling}
          />
        </div>

        {latestRun ? (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate/20 bg-surface-muted px-4 py-3 text-xs text-slate">
              <span>Run #{latestRun.runNumber}</span>
              <span className="flex items-center gap-2">
                <span>Status</span>
                <span
                  className={`${badgeBase} ${reconStatusBadgeClasses[latestRun.status]}`}
                >
                  {reconStatusLabels[latestRun.status]}
                </span>
              </span>
              <span>
                Exceptions: {latestRun.exceptions.length}
              </span>
              <span>
                {latestRun.createdAt.toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short"
                })}
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate/20">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate/20 text-[10px] uppercase tracking-[0.2em] text-slate">
                  <tr>
                    <th className="px-4 py-3">Check</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Delta</th>
                    <th className="px-4 py-3">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {latestRun.checkResults.map((check) => {
                    const details = check.details as {
                      deltaValue?: number;
                    };
                    return (
                      <tr key={check.id} className="border-b border-slate/10">
                        <td className="px-4 py-3 font-semibold text-ink">
                          {checkLabels[check.checkType] ?? check.checkType}
                        </td>
                        <td className="px-4 py-3 text-slate">{check.status}</td>
                        <td className="px-4 py-3 text-slate">{check.severity}</td>
                        <td className="px-4 py-3 text-slate">
                          {typeof details?.deltaValue === "number"
                            ? formatNumber(details.deltaValue)
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-slate">{check.summary}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {latestRun.exceptions.length > 0 ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                {latestRun.exceptions.length} exceptions created. Resolve them
                before review.
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                No exceptions found for the latest run.
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-slate/20 bg-surface-muted px-4 py-3 text-xs text-slate">
            No reconciliation runs yet.
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Review</h2>
            <p className="mt-2 text-sm text-slate">
              Submit the pay run for review or record reviewer decisions.
            </p>
          </div>
          <Link
            href={`/pay-runs/${payRun.id}/exceptions` as Route}
            className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
          >
            View exceptions
          </Link>
        </div>
        <div className="mt-4">
          <PayRunReviewActions
            payRunId={payRun.id}
            status={payRun.status}
            role={user.role}
            gate={reviewGate}
            latestApproval={
              latestApproval
                ? {
                    status: latestApproval.status,
                    comment: latestApproval.comment,
                    createdAt: latestApproval.createdAt.toISOString(),
                    reviewerEmail: latestApproval.reviewerUser.email
                  }
                : null
            }
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Pack</h2>
            <p className="mt-2 text-sm text-slate">
              Generate the reconciliation pack PDF and lock when complete.
            </p>
            {latestPack ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate">
                <span>Status</span>
                <span
                  className={`${badgeBase} ${
                    latestPack.lockedAt
                      ? lockBadgeClasses.locked
                      : lockBadgeClasses.unlocked
                  }`}
                >
                  {latestPack.lockedAt ? "Locked" : "Unlocked"}
                </span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-4">
          <PackActions
            payRunId={payRun.id}
            status={payRun.status}
            role={user.role}
            pack={
              latestPack
                ? {
                    id: latestPack.id,
                    packVersion: latestPack.packVersion,
                    generatedAt: latestPack.generatedAt.toISOString(),
                    lockedAt: latestPack.lockedAt
                      ? latestPack.lockedAt.toISOString()
                      : null,
                    downloadUrl: packDownloadUrl
                  }
                : null
            }
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface">
        <div className="border-b border-slate/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Import history</h2>
          <p className="mt-1 text-xs text-slate">
            Versions are immutable. Uploading a new file creates a new version.
          </p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate/20 text-xs uppercase tracking-[0.2em] text-slate">
            <tr>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3">Template</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {imports.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-sm text-slate">
                  No imports yet. Upload a file to start tracking versions.
                </td>
              </tr>
            ) : (
              imports.map((entry) => (
                <tr key={entry.id} className="border-b border-slate/10">
                  <td className="px-4 py-3 font-semibold text-ink">
                    {sourceLabels[entry.sourceType]}
                  </td>
                  <td className="px-4 py-3 text-slate">v{entry.version}</td>
                  <td className="px-4 py-3 text-slate">{entry.originalFilename}</td>
                  <td className="px-4 py-3 text-slate">
                    {formatBytes(entry.sizeBytes)}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {entry.uploadedByUser.email}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {entry.mappingTemplateVersion
                      ? `v${entry.mappingTemplateVersion.version}`
                      : entry.mappingTemplateVersionId
                        ? "Template applied"
                        : "Not mapped"}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    <span
                      className={`${badgeBase} ${importStatusBadgeClasses[entry.parseStatus]}`}
                    >
                      {importStatusLabels[entry.parseStatus]}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface">
        <div className="border-b border-slate/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Timeline</h2>
          <p className="mt-1 text-xs text-slate">
            Major workflow events for this pay run.
          </p>
        </div>
        <div className="divide-y divide-slate/10">
          {timelineEvents.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate">
              No activity recorded yet.
            </p>
          ) : (
            timelineEvents.map((event) => (
              <div
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-ink">{event.action}</p>
                  <p className="text-xs text-slate">
                    {event.actorUser?.email ?? "System"}
                  </p>
                </div>
                <p className="text-xs text-slate">
                  {event.timestamp.toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short"
                  })}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
