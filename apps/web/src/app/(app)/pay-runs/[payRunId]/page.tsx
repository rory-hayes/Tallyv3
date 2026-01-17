import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { prisma, type SourceType } from "@tally/db";
import { requireUser } from "@/lib/auth";
import { getReviewGateStatus } from "@/lib/pay-run-review";
import { getPackDownloadUrl } from "@/lib/packs";
import { ImportUploader } from "./ImportUploader";
import { ReconciliationRunner } from "./ReconciliationRunner";
import { PayRunReviewActions } from "./PayRunReviewActions";
import { PackActions } from "./PackActions";

export const dynamic = "force-dynamic";

type PayRunDetailPageProps = {
  params: { payRunId: string };
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

  const [reviewGate, latestApproval, latestPack] = await Promise.all([
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
    })
  ]);

  const packDownloadUrl = latestPack ? await getPackDownloadUrl(latestPack) : null;

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
      STATUTORY: []
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
    STATUTORY: "Statutory Totals"
  };

  const checkLabels: Record<string, string> = {
    CHK_REGISTER_NET_TO_BANK_TOTAL: "Register vs Bank totals",
    CHK_JOURNAL_DEBITS_EQUAL_CREDITS: "Journal balance"
  };

  const isLocked = payRun.status === "LOCKED" || payRun.status === "ARCHIVED";
  const isReconciling = payRun.status === "RECONCILING";

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
            Revision {payRun.revision} · {payRun.status}
          </p>
        </div>
        <Link
          href={`/clients/${payRun.clientId}` as Route}
          className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
        >
          View client
        </Link>
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
                    <p className="mt-2 text-sm font-semibold text-ink">
                      {latest
                        ? `Version ${latest.version} · ${latest.parseStatus}`
                        : "No uploads yet"}
                    </p>
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
                    {latest ? (
                      <p className="mt-1 text-xs text-slate">
                        {latest.originalFilename} · {formatBytes(latest.sizeBytes)}
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
              <span>Status: {latestRun.status}</span>
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
            href={`/exceptions?payRunId=${payRun.id}` as Route}
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
                  <td className="px-4 py-3 text-slate">{entry.parseStatus}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
