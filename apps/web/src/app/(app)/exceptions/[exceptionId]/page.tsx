import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { prisma, type SourceType } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { readImportFile } from "@/lib/import-file";
import {
  mappingFieldConfigs,
  normalizeColumnName,
  type ColumnMap
} from "@/lib/mapping-utils";
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

const sourceLabels: Record<SourceType, string> = {
  REGISTER: "Register",
  BANK: "Bank / Payments",
  GL: "GL Journal",
  STATUTORY: "Statutory Totals",
  PENSION_SCHEDULE: "Pension Schedule"
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

  const importRecords = evidence.length
    ? await prisma.import.findMany({
        where: {
          firmId: session.firmId,
          id: { in: Array.from(new Set(evidence.map((item) => item.importId))) }
        },
        include: { mappingTemplateVersion: true }
      })
    : [];

  const importsById = new Map(importRecords.map((record) => [record.id, record]));
  const parsedCache = new Map<
    string,
    | {
        rows: string[][];
        headerRowIndex: number;
        columnIndexByNormalized: Map<string, number>;
        mappedColumns: Array<{
          label: string;
          columnName: string;
          columnIndex: number;
        }>;
      }
    | null
  >();

  const loadParsedImport = async (importId: string) => {
    if (parsedCache.has(importId)) {
      return parsedCache.get(importId) ?? null;
    }
    const record = importsById.get(importId);
    if (!record || !record.mappingTemplateVersion) {
      parsedCache.set(importId, null);
      return null;
    }
    const template = record.mappingTemplateVersion;
    const { rows } = await readImportFile(record, {
      sheetName: template.sheetName ?? null
    });
    const headerRowIndex = template.headerRowIndex ?? 0;
    const headerRow = rows[headerRowIndex] ?? [];
    const columnIndexByNormalized = new Map<string, number>();
    headerRow.forEach((column, index) => {
      const normalized = normalizeColumnName(String(column));
      if (normalized) {
        columnIndexByNormalized.set(normalized, index);
      }
    });
    const columnMap = template.columnMap as ColumnMap;
    const mappedColumns = mappingFieldConfigs[record.sourceType].fields
      .map((field) => {
        const columnName = columnMap[field.key];
        if (!columnName) {
          return null;
        }
        const normalized = normalizeColumnName(columnName);
        const columnIndex = normalized
          ? columnIndexByNormalized.get(normalized)
          : undefined;
        if (columnIndex === undefined) {
          return null;
        }
        return {
          label: field.label,
          columnName,
          columnIndex
        };
      })
      .filter(Boolean) as Array<{
      label: string;
      columnName: string;
      columnIndex: number;
    }>;

    const parsed = {
      rows,
      headerRowIndex,
      columnIndexByNormalized,
      mappedColumns
    };
    parsedCache.set(importId, parsed);
    return parsed;
  };

  const evidenceGroups = await Promise.all(
    evidence.map(async (item) => {
      const record = importsById.get(item.importId);
      if (!record) {
        return {
          importId: item.importId,
          sourceType: null,
          note: item.note ?? null,
          rows: [],
          error: "Import record is unavailable."
        };
      }

      try {
        const parsed = await loadParsedImport(item.importId);
        if (!parsed) {
          return {
            importId: item.importId,
            sourceType: record.sourceType,
            note: item.note ?? null,
            rows: [],
            error: "Mapping metadata is missing for this import."
          };
        }

        const rows = item.rowNumbers.map((rowNumber) => {
          const rowIndex = rowNumber - 1;
          const row = parsed.rows[rowIndex] ?? [];
          const rawValues = parsed.mappedColumns.map((column) => ({
            label: column.columnName,
            value: String(row[column.columnIndex] ?? "")
          }));
          const normalizedValues = parsed.mappedColumns.map((column) => ({
            label: column.label,
            value: String(row[column.columnIndex] ?? "")
          }));
          return {
            rowNumber,
            rawValues,
            normalizedValues
          };
        });

        return {
          importId: item.importId,
          sourceType: record.sourceType,
          note: item.note ?? null,
          fileName: record.originalFilename,
          rows,
          error: null
        };
      } catch (error) {
        return {
          importId: item.importId,
          sourceType: record.sourceType,
          note: item.note ?? null,
          rows: [],
          error:
            error instanceof Error
              ? error.message
              : "Unable to load evidence rows."
        };
      }
    })
  );

  const latestImports = await prisma.import.findMany({
    where: {
      firmId: session.firmId,
      payRunId: exception.payRunId
    },
    orderBy: [{ sourceType: "asc" }, { version: "desc" }]
  });

  const latestBySource = new Map<SourceType, (typeof latestImports)[number]>();
  for (const entry of latestImports) {
    if (!latestBySource.has(entry.sourceType)) {
      latestBySource.set(entry.sourceType, entry);
    }
  }

  const remediation = (() => {
    const addExpectedVariance =
      user.role === "ADMIN" || user.role === "REVIEWER"
        ? {
            label: "Add expected variance",
            href: `/clients/${exception.payRun.clientId}/expected-variances` as Route
          }
        : null;

    if (exception.category === "BANK_MISMATCH") {
      const mappingTarget = latestBySource.get("BANK");
      return {
        title: "Why this typically happens",
        causes: [
          "Payments were exported in multiple batches or split across files.",
          "Bank file includes reimbursements or adjustments not in the register.",
          "Mapping pulled the wrong amount column."
        ],
        nextSteps: [
          {
            label: "Upload corrected bank export",
            href: `/pay-runs/${exception.payRunId}` as Route
          },
          ...(mappingTarget
            ? [
                {
                  label: "Update bank mapping",
                  href: `/imports/${mappingTarget.id}/mapping` as Route
                }
              ]
            : []),
          ...(addExpectedVariance ? [addExpectedVariance] : [])
        ]
      };
    }

    if (exception.category === "BANK_DATA_QUALITY") {
      const mappingTarget = latestBySource.get("BANK");
      return {
        title: "Why this typically happens",
        causes: [
          "Duplicate rows were exported or re-uploaded.",
          "Negative or zero payments were included in the bank file.",
          "Incorrect payee or reference mapping caused duplicates."
        ],
        nextSteps: [
          {
            label: "Review bank export",
            href: `/pay-runs/${exception.payRunId}` as Route
          },
          ...(mappingTarget
            ? [
                {
                  label: "Update bank mapping",
                  href: `/imports/${mappingTarget.id}/mapping` as Route
                }
              ]
            : [])
        ]
      };
    }

    if (exception.category === "JOURNAL_MISMATCH") {
      const mappingTarget = latestBySource.get("GL");
      return {
        title: "Why this typically happens",
        causes: [
          "Journal accounts are misclassified for payroll expense or liabilities.",
          "Employer costs or tax lines are missing from the journal export.",
          "The journal includes clearing accounts not mapped to payroll classes."
        ],
        nextSteps: [
          {
            label: "Update account classifications",
            href: `/clients/${exception.payRun.clientId}/account-classifications` as Route
          },
          ...(mappingTarget
            ? [
                {
                  label: "Update GL mapping",
                  href: `/imports/${mappingTarget.id}/mapping` as Route
                }
              ]
            : []),
          ...(addExpectedVariance ? [addExpectedVariance] : [])
        ]
      };
    }

    if (exception.category === "STATUTORY_MISMATCH") {
      const mappingTarget = latestBySource.get("STATUTORY");
      return {
        title: "Why this typically happens",
        causes: [
          "Statutory categories were mapped to the wrong internal labels.",
          "The statutory export is missing adjustments or late filings.",
          "Register deductions include items not captured in statutory totals."
        ],
        nextSteps: [
          {
            label: "Upload corrected statutory totals",
            href: `/pay-runs/${exception.payRunId}` as Route
          },
          ...(mappingTarget
            ? [
                {
                  label: "Update statutory mapping",
                  href: `/imports/${mappingTarget.id}/mapping` as Route
                }
              ]
            : []),
          ...(addExpectedVariance ? [addExpectedVariance] : [])
        ]
      };
    }

    return {
      title: "Why this typically happens",
      causes: [
        "The data export is missing required columns.",
        "Mappings point to the wrong headers.",
        "The source file was modified after export."
      ],
      nextSteps: [
        {
          label: "Upload corrected source",
          href: `/pay-runs/${exception.payRunId}` as Route
        },
        ...(addExpectedVariance ? [addExpectedVariance] : [])
      ]
    };
  })();

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

            {details.expectedVariance ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                Expected variance applied · {details.expectedVariance.varianceType} ·
                Downgraded to {details.expectedVariance.downgradeTo}.
              </div>
            ) : null}
          </div>

          {details.categoryBreakdown || details.unmappedCategories ? (
            <div className="rounded-xl border border-slate/20 bg-surface p-6">
              <h2 className="text-sm font-semibold text-ink">Category breakdown</h2>
              {details.categoryBreakdown && details.categoryBreakdown.length > 0 ? (
                <div className="mt-4 overflow-x-auto rounded-lg border border-slate/20">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate/20 uppercase tracking-[0.2em] text-slate">
                      <tr>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Register</th>
                        <th className="px-4 py-3">Statutory</th>
                        <th className="px-4 py-3">Delta</th>
                        <th className="px-4 py-3">Within tolerance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.categoryBreakdown.map((row) => (
                        <tr key={row.category} className="border-b border-slate/10">
                          <td className="px-4 py-3 font-semibold text-ink">
                            {row.category}
                          </td>
                          <td className="px-4 py-3 text-slate">
                            {formatNumber(row.registerTotal)}
                          </td>
                          <td className="px-4 py-3 text-slate">
                            {formatNumber(row.statutoryTotal)}
                          </td>
                          <td className="px-4 py-3 text-slate">
                            {formatNumber(row.delta)}
                          </td>
                          <td className="px-4 py-3 text-slate">
                            {row.withinTolerance ? "Yes" : "No"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate">
                  No category breakdown recorded for this check.
                </p>
              )}

              {details.unmappedCategories && details.unmappedCategories.length > 0 ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  Unmapped statutory categories:{" "}
                  {details.unmappedCategories.join(", ")}.
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-xl border border-slate/20 bg-surface p-6">
            <h2 className="text-sm font-semibold text-ink">Evidence</h2>
            <p className="mt-2 text-xs text-slate">
              Rows are ranked by absolute contribution to the delta.
            </p>
            {evidenceGroups.length === 0 ? (
              <p className="mt-3 text-sm text-slate">
                No evidence pointers were recorded.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {evidenceGroups.map((group, index) => (
                  <div
                    key={`${group.importId}-${index}`}
                    className="rounded-lg border border-slate/20 bg-surface-muted p-4 text-xs text-slate"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink">
                          {group.sourceType
                            ? sourceLabels[group.sourceType]
                            : "Unknown source"}{" "}
                          · {group.fileName ?? "Unknown file"}
                        </p>
                        <p className="mt-1 text-[11px] text-slate">
                          Import {group.importId}
                        </p>
                      </div>
                      {group.note ? (
                        <span className="rounded-full border border-slate/30 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate">
                          {group.note}
                        </span>
                      ) : null}
                    </div>

                    {group.error ? (
                      <p className="mt-3 text-xs text-rose-700">{group.error}</p>
                    ) : group.rows.length === 0 ? (
                      <p className="mt-3 text-xs text-slate">
                        Evidence rows are unavailable for this import.
                      </p>
                    ) : (
                      <div className="mt-4 overflow-x-auto rounded-lg border border-slate/20">
                        <table className="w-full text-left text-[11px]">
                          <thead className="border-b border-slate/20 uppercase tracking-[0.2em] text-slate">
                            <tr>
                              <th className="px-3 py-2">Row</th>
                              <th className="px-3 py-2">Raw values</th>
                              <th className="px-3 py-2">Normalized values</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map((row) => (
                              <tr key={row.rowNumber} className="border-b border-slate/10">
                                <td className="px-3 py-2 text-slate">
                                  #{row.rowNumber}
                                </td>
                                <td className="px-3 py-2 text-slate">
                                  <div className="space-y-1">
                                    {row.rawValues.length === 0 ? (
                                      <span className="text-slate">No mapped columns.</span>
                                    ) : (
                                      row.rawValues.map((entry) => (
                                        <p key={entry.label}>
                                          <span className="font-semibold text-ink">
                                            {entry.label}:
                                          </span>{" "}
                                          {entry.value || "-"}
                                        </p>
                                      ))
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-slate">
                                  <div className="space-y-1">
                                    {row.normalizedValues.length === 0 ? (
                                      <span className="text-slate">
                                        No normalized fields.
                                      </span>
                                    ) : (
                                      row.normalizedValues.map((entry) => (
                                        <p key={entry.label}>
                                          <span className="font-semibold text-ink">
                                            {entry.label}:
                                          </span>{" "}
                                          {entry.value || "-"}
                                        </p>
                                      ))
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-slate/20 bg-surface p-6 text-sm">
            <h2 className="text-sm font-semibold text-ink">Remediation</h2>
            <div className="mt-4 space-y-3 text-slate">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                  {remediation.title}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate">
                  {remediation.causes.map((cause) => (
                    <li key={cause}>{cause}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                  What to do next
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {remediation.nextSteps.map((step) => (
                    <Link
                      key={step.href}
                      href={step.href}
                      className="rounded-lg border border-slate/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
                    >
                      {step.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

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
