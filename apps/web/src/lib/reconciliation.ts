import "server-only";

import {
  prisma,
  type MappingTemplate,
  type SourceType
} from "@/lib/prisma";
import { recordAuditEvent } from "./audit";
import { ValidationError, NotFoundError } from "./errors";
import { readImportFile } from "./import-file";
import { startSpan } from "./logger";
import { type ColumnMap, normalizeColumnName } from "./mapping-utils";
import { requirePermission } from "./permissions";
import { assertPayRunTransition } from "./pay-run-state";
import { transitionPayRunStatus } from "./pay-runs";
import {
  evaluateJournalDebitsEqualCredits,
  evaluateRegisterNetToBankTotal,
  type CheckEvaluation,
  type TotalWithRows
} from "./reconciliation-checks";

type ActorContext = {
  firmId: string;
  userId: string;
  role: "ADMIN" | "PREPARER" | "REVIEWER";
};

type ParsedImport = {
  rows: string[][];
  headerRowIndex: number;
  columnIndexByNormalized: Map<string, number>;
};

type BundleConfig = {
  bundleId: string;
  bundleVersion: string;
  registerNetToBankTolerance: {
    absoluteCents: number;
    percent: number;
  };
  journalBalanceTolerance: {
    absoluteCents: number;
    percent: number;
  };
};

const REQUIRED_SOURCES: SourceType[] = ["REGISTER", "BANK", "GL"];

const parseAmount = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  const isParenNegative = raw.startsWith("(") && raw.endsWith(")");
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (!cleaned) {
    return null;
  }
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return isParenNegative ? -Math.abs(parsed) : parsed;
};

const toCents = (value: number): number => Math.round(value * 100);

const getBundleConfig = (region: "UK" | "IE"): BundleConfig => {
  if (region === "IE") {
    return {
      bundleId: "BUNDLE_IE",
      bundleVersion: "V1",
      registerNetToBankTolerance: { absoluteCents: 100, percent: 0.05 },
      journalBalanceTolerance: { absoluteCents: 50, percent: 0.01 }
    };
  }

  return {
    bundleId: "BUNDLE_UK",
    bundleVersion: "V1",
    registerNetToBankTolerance: { absoluteCents: 100, percent: 0.05 },
    journalBalanceTolerance: { absoluteCents: 50, percent: 0.01 }
  };
};

const buildParsedImport = async (
  importRecord: { storageUri: string; originalFilename: string },
  template: MappingTemplate
): Promise<ParsedImport> => {
  const { rows } = await readImportFile(importRecord, {
    sheetName: template.sheetName ?? null
  });
  const headerRowIndex = template.headerRowIndex ?? 0;
  if (rows.length === 0 || headerRowIndex >= rows.length) {
    throw new ValidationError("Unable to locate the header row for this import.");
  }

  const headerRow = rows[headerRowIndex] ?? [];
  const columnIndexByNormalized = new Map<string, number>();
  headerRow.forEach((column, index) => {
    const normalized = normalizeColumnName(String(column));
    if (normalized) {
      columnIndexByNormalized.set(normalized, index);
    }
  });

  if (columnIndexByNormalized.size === 0) {
    throw new ValidationError("No columns were detected for this import.");
  }

  return { rows, headerRowIndex, columnIndexByNormalized };
};

const resolveColumnIndex = (
  parsed: ParsedImport,
  columnName: string | null | undefined
): number => {
  if (!columnName) {
    throw new ValidationError("Required mapping column is missing.");
  }
  const normalized = normalizeColumnName(columnName);
  const index = normalized ? parsed.columnIndexByNormalized.get(normalized) : undefined;
  if (index === undefined) {
    throw new ValidationError(
      `Mapped column "${columnName}" is missing from the latest import.`
    );
  }
  return index;
};

const collectColumnTotals = (
  parsed: ParsedImport,
  columnName: string | null | undefined
): TotalWithRows => {
  const columnIndex = resolveColumnIndex(parsed, columnName);
  let totalCents = 0;
  const rows: TotalWithRows["rows"] = [];

  parsed.rows.forEach((row, rowIndex) => {
    if (rowIndex <= parsed.headerRowIndex) {
      return;
    }
    if (row.every((cell) => String(cell).trim().length === 0)) {
      return;
    }
    const parsedValue = parseAmount(row[columnIndex]);
    if (parsedValue === null) {
      return;
    }
    const amountCents = toCents(parsedValue);
    totalCents += amountCents;
    rows.push({ rowNumber: rowIndex + 1, amountCents });
  });

  return { totalCents, rows };
};

const collectJournalTotals = (
  parsed: ParsedImport,
  columnMap: ColumnMap
): { debits: TotalWithRows; credits: TotalWithRows } => {
  const signedColumn = columnMap.signedAmount ?? null;
  if (signedColumn) {
    const columnIndex = resolveColumnIndex(parsed, signedColumn);
    let debitTotal = 0;
    let creditTotal = 0;
    const debitRows: TotalWithRows["rows"] = [];
    const creditRows: TotalWithRows["rows"] = [];

    parsed.rows.forEach((row, rowIndex) => {
      if (rowIndex <= parsed.headerRowIndex) {
        return;
      }
      if (row.every((cell) => String(cell).trim().length === 0)) {
        return;
      }
      const parsedValue = parseAmount(row[columnIndex]);
      if (parsedValue === null || parsedValue === 0) {
        return;
      }
      const amountCents = toCents(parsedValue);
      if (amountCents > 0) {
        debitTotal += amountCents;
        debitRows.push({ rowNumber: rowIndex + 1, amountCents });
      } else {
        const creditCents = Math.abs(amountCents);
        creditTotal += creditCents;
        creditRows.push({ rowNumber: rowIndex + 1, amountCents: creditCents });
      }
    });

    return {
      debits: { totalCents: debitTotal, rows: debitRows },
      credits: { totalCents: creditTotal, rows: creditRows }
    };
  }

  const debitColumn = columnMap.debit ?? null;
  const creditColumn = columnMap.credit ?? null;
  if (!debitColumn || !creditColumn) {
    throw new ValidationError("Journal template must include debit and credit.");
  }

  const debitIndex = resolveColumnIndex(parsed, debitColumn);
  const creditIndex = resolveColumnIndex(parsed, creditColumn);
  let debitTotal = 0;
  let creditTotal = 0;
  const debitRows: TotalWithRows["rows"] = [];
  const creditRows: TotalWithRows["rows"] = [];

  parsed.rows.forEach((row, rowIndex) => {
    if (rowIndex <= parsed.headerRowIndex) {
      return;
    }
    if (row.every((cell) => String(cell).trim().length === 0)) {
      return;
    }

    const debitValue = parseAmount(row[debitIndex]);
    if (debitValue !== null && debitValue !== 0) {
      const amountCents = toCents(Math.abs(debitValue));
      debitTotal += amountCents;
      debitRows.push({ rowNumber: rowIndex + 1, amountCents });
    }

    const creditValue = parseAmount(row[creditIndex]);
    if (creditValue !== null && creditValue !== 0) {
      const amountCents = toCents(Math.abs(creditValue));
      creditTotal += amountCents;
      creditRows.push({ rowNumber: rowIndex + 1, amountCents });
    }
  });

  return {
    debits: { totalCents: debitTotal, rows: debitRows },
    credits: { totalCents: creditTotal, rows: creditRows }
  };
};

type ImportWithTemplate = Awaited<
  ReturnType<typeof prisma.import.findMany>
>[number] & { mappingTemplateVersion: MappingTemplate | null };

const ensureMappedImport = (
  source: SourceType,
  entry: ImportWithTemplate | undefined
): ImportWithTemplate & { mappingTemplateVersion: MappingTemplate } => {
  if (!entry) {
    throw new ValidationError(`Missing ${source} import for reconciliation.`);
  }
  if (!entry.mappingTemplateVersion) {
    throw new ValidationError(`Mapping required for ${source} import.`);
  }
  return entry as ImportWithTemplate & { mappingTemplateVersion: MappingTemplate };
};

export const runReconciliation = async (
  context: ActorContext,
  payRunId: string
) => {
  requirePermission(context.role, "reconciliation:run");

  const payRun = await prisma.payRun.findFirst({
    where: {
      id: payRunId,
      firmId: context.firmId
    },
    include: {
      firm: true
    }
  });

  if (!payRun) {
    throw new NotFoundError("Pay run not found.");
  }

  const span = startSpan("RECONCILIATION_RUN", {
    firmId: context.firmId,
    payRunId: payRun.id
  });

  try {
    if (payRun.status === "LOCKED" || payRun.status === "ARCHIVED") {
      throw new ValidationError("Locked pay runs cannot be reconciled.");
    }

    assertPayRunTransition(payRun.status, "RECONCILING", context.role);

    const imports = await prisma.import.findMany({
      where: {
        firmId: context.firmId,
        payRunId: payRun.id
      },
      include: {
        mappingTemplateVersion: true
      },
      orderBy: [{ sourceType: "asc" }, { version: "desc" }]
    });

    const latestBySource = new Map<
      SourceType,
      (typeof imports)[number] & { mappingTemplateVersion: MappingTemplate | null }
    >();
    for (const entry of imports) {
      if (!latestBySource.has(entry.sourceType)) {
        latestBySource.set(entry.sourceType, entry);
      }
    }

    for (const source of REQUIRED_SOURCES) {
      ensureMappedImport(source, latestBySource.get(source));
    }

    const registerImport = ensureMappedImport(
      "REGISTER",
      latestBySource.get("REGISTER")
    );
    const bankImport = ensureMappedImport("BANK", latestBySource.get("BANK"));
    const glImport = ensureMappedImport("GL", latestBySource.get("GL"));

    const parsedRegister = await buildParsedImport(
      registerImport,
      registerImport.mappingTemplateVersion
    );
    const parsedBank = await buildParsedImport(
      bankImport,
      bankImport.mappingTemplateVersion
    );
    const parsedGl = await buildParsedImport(
      glImport,
      glImport.mappingTemplateVersion
    );

    const registerColumnMap = registerImport.mappingTemplateVersion
      .columnMap as ColumnMap;
    const bankColumnMap = bankImport.mappingTemplateVersion
      .columnMap as ColumnMap;
    const glColumnMap = glImport.mappingTemplateVersion.columnMap as ColumnMap;

    const registerTotals = collectColumnTotals(
      parsedRegister,
      registerColumnMap.netPay
    );
    const bankTotals = collectColumnTotals(parsedBank, bankColumnMap.amount);
    const journalTotals = collectJournalTotals(parsedGl, glColumnMap);

    const bundle = getBundleConfig(payRun.firm.region);

    const evaluations: CheckEvaluation[] = [
      evaluateRegisterNetToBankTotal({
        register: registerTotals,
        bank: bankTotals,
        registerImportId: registerImport.id,
        bankImportId: bankImport.id,
        tolerance: bundle.registerNetToBankTolerance
      }),
      evaluateJournalDebitsEqualCredits({
        debits: journalTotals.debits,
        credits: journalTotals.credits,
        glImportId: glImport.id,
        tolerance: bundle.journalBalanceTolerance
      })
    ];

    const latestRun = await prisma.reconciliationRun.findFirst({
      where: {
        payRunId: payRun.id
      },
      orderBy: { runNumber: "desc" }
    });
    const runNumber = latestRun ? latestRun.runNumber + 1 : 1;

    const inputSummary = {
      imports: {
        REGISTER: {
          importId: registerImport.id,
          version: registerImport.version,
          templateId: registerImport.mappingTemplateVersionId
        },
        BANK: {
          importId: bankImport.id,
          version: bankImport.version,
          templateId: bankImport.mappingTemplateVersionId
        },
        GL: {
          importId: glImport.id,
          version: glImport.version,
          templateId: glImport.mappingTemplateVersionId
        }
      }
    };

    await transitionPayRunStatus(
      {
        firmId: context.firmId,
        userId: context.userId,
        role: context.role
      },
      payRun.id,
      "RECONCILING"
    );

    await recordAuditEvent(
      {
        action: "RECONCILIATION_STARTED",
        entityType: "PAY_RUN",
        entityId: payRun.id,
        metadata: {
          runNumber
        }
      },
      {
        firmId: context.firmId,
        actorUserId: context.userId
      }
    );

    const supersededAt = new Date();
    const createdExceptions: Array<{
      id: string;
      checkType: string;
      severity: string;
    }> = [];
    const run = await prisma.$transaction(async (tx) => {
      const createdRun = await tx.reconciliationRun.create({
        data: {
          firmId: context.firmId,
          payRunId: payRun.id,
          runNumber,
          bundleId: bundle.bundleId,
          bundleVersion: bundle.bundleVersion,
          status: "SUCCESS",
          inputSummary,
          executedByUserId: context.userId
        }
      });

      await tx.reconciliationRun.updateMany({
        where: {
          payRunId: payRun.id,
          supersededAt: null,
          id: { not: createdRun.id }
        },
        data: {
          supersededAt,
          supersededByRunId: createdRun.id
        }
      });

      await tx.exception.updateMany({
        where: {
          payRunId: payRun.id,
          supersededAt: null
        },
        data: {
          supersededAt,
          supersededByRunId: createdRun.id
        }
      });

      for (const evaluation of evaluations) {
        const checkResult = await tx.checkResult.create({
          data: {
            reconciliationRunId: createdRun.id,
            checkType: evaluation.checkType,
            checkVersion: evaluation.checkVersion,
            status: evaluation.status,
            severity: evaluation.severity,
            summary: evaluation.summary,
            details: evaluation.details,
            evidence: evaluation.evidence ?? undefined
          }
        });

        if (evaluation.exception) {
          const exception = await tx.exception.create({
            data: {
              firmId: context.firmId,
              payRunId: payRun.id,
              reconciliationRunId: createdRun.id,
              checkResultId: checkResult.id,
              category: evaluation.exception.category,
              severity: evaluation.severity,
              title: evaluation.exception.title,
              description: evaluation.exception.description,
              evidence: evaluation.exception.evidence ?? undefined
            }
          });
          createdExceptions.push({
            id: exception.id,
            checkType: evaluation.checkType,
            severity: evaluation.severity
          });
        }
      }

      return createdRun;
    });

    await transitionPayRunStatus(
      {
        firmId: context.firmId,
        userId: null,
        role: "SYSTEM"
      },
      payRun.id,
      "RECONCILED"
    );

    await recordAuditEvent(
      {
        action: "RECONCILIATION_COMPLETED",
        entityType: "PAY_RUN",
        entityId: payRun.id,
        metadata: {
          runNumber,
          status: "SUCCESS"
        }
      },
      {
        firmId: context.firmId,
        actorUserId: context.userId
      }
    );

    for (const exception of createdExceptions) {
      await recordAuditEvent(
        {
          action: "EXCEPTION_CREATED",
          entityType: "EXCEPTION",
          entityId: exception.id,
          metadata: {
            payRunId: payRun.id,
            checkType: exception.checkType,
            severity: exception.severity
          }
        },
        {
          firmId: context.firmId,
          actorUserId: context.userId
        }
      );
    }

    span.end({ runId: run.id, status: "SUCCESS" });
    return {
      runId: run.id,
      runNumber: run.runNumber,
      checkCount: evaluations.length,
      exceptionCount: createdExceptions.length
    };
  } catch (error) {
    span.fail(error);
    throw error;
  }
};
