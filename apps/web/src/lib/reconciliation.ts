import "server-only";

import {
  prisma,
  type MappingTemplate,
  type SourceType,
  type AccountClass
} from "@/lib/prisma";
import { recordAuditEvent } from "./audit";
import { ValidationError, NotFoundError } from "./errors";
import { readImportFile } from "./import-file";
import { isImportErrorStatus } from "./import-status";
import { startSpan, withRetry } from "./logger";
import { type ColumnMap, normalizeColumnName } from "./mapping-utils";
import { requirePermission } from "./permissions";
import { assertPayRunTransition } from "./pay-run-state";
import { transitionPayRunStatus } from "./pay-runs";
import { resolveRequiredSources } from "./required-sources";
import { resolveTolerances } from "./tolerances";
import {
  evaluateBankDuplicatePayments,
  evaluateBankNegativePayments,
  evaluateBankPaymentCountMismatch,
  evaluateJournalDebitsEqualCredits,
  evaluateRegisterDeductionsToStatutoryTotals,
  evaluateRegisterNetToBankTotal,
  evaluateRegisterPensionToScheduleTotal,
  evaluateRegisterToJournalTotal,
  type CheckEvaluation,
  type TotalWithRows
} from "./reconciliation-checks";
import { applyExpectedVariances } from "./expected-variances";

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
};

type StatutoryCategoryKey =
  | "TAX_PRIMARY"
  | "TAX_SECONDARY"
  | "TAX_OTHER"
  | "PENSION_EMPLOYEE"
  | "PENSION_EMPLOYER"
  | "OTHER_DEDUCTIONS";

const STATUTORY_CATEGORY_KEYS: StatutoryCategoryKey[] = [
  "TAX_PRIMARY",
  "TAX_SECONDARY",
  "TAX_OTHER",
  "PENSION_EMPLOYEE",
  "PENSION_EMPLOYER",
  "OTHER_DEDUCTIONS"
];

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
      bundleVersion: "V1"
    };
  }

  return {
    bundleId: "BUNDLE_UK",
    bundleVersion: "V1"
  };
};

const buildStatutoryCategoryLabels = (region: "UK" | "IE") => {
  if (region === "IE") {
    return {
      TAX_PRIMARY: "PAYE / USC",
      TAX_SECONDARY: "PRSI",
      TAX_OTHER: "Other tax",
      PENSION_EMPLOYEE: "Pension (employee)",
      PENSION_EMPLOYER: "Pension (employer)",
      OTHER_DEDUCTIONS: "Other deductions"
    } satisfies Record<StatutoryCategoryKey, string>;
  }

  return {
    TAX_PRIMARY: "PAYE",
    TAX_SECONDARY: "National Insurance",
    TAX_OTHER: "Other tax",
    PENSION_EMPLOYEE: "Pension (employee)",
    PENSION_EMPLOYER: "Pension (employer)",
    OTHER_DEDUCTIONS: "Other deductions"
  } satisfies Record<StatutoryCategoryKey, string>;
};

const buildParsedImport = async (
  importRecord: { id: string; storageUri: string; originalFilename: string },
  template: MappingTemplate,
  context: { firmId: string }
): Promise<ParsedImport> => {
  const { rows } = await withRetry(
    () =>
      readImportFile(importRecord, {
        sheetName: template.sheetName ?? null
      }),
    {
      event: "RECONCILIATION_IMPORT_READ",
      context: {
        firmId: context.firmId,
        importId: importRecord.id
      },
      shouldRetry: (error) => !(error instanceof ValidationError)
    }
  );
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

const resolveOptionalColumnIndex = (
  parsed: ParsedImport,
  columnName: string | null | undefined
): number | null => {
  if (!columnName) {
    return null;
  }
  const normalized = normalizeColumnName(columnName);
  const index = normalized ? parsed.columnIndexByNormalized.get(normalized) : undefined;
  return index ?? null;
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

const collectOptionalColumnTotals = (
  parsed: ParsedImport,
  columnName: string | null | undefined
): TotalWithRows => {
  if (!columnName) {
    return { totalCents: 0, rows: [] };
  }
  return collectColumnTotals(parsed, columnName);
};

const combineTotals = (...totals: TotalWithRows[]): TotalWithRows => {
  return totals.reduce(
    (acc, entry) => ({
      totalCents: acc.totalCents + entry.totalCents,
      rows: [...acc.rows, ...entry.rows]
    }),
    { totalCents: 0, rows: [] }
  );
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

const collectJournalClassTotals = ({
  parsed,
  columnMap,
  classifications
}: {
  parsed: ParsedImport;
  columnMap: ColumnMap;
  classifications: Array<{ accountCode: string; classification: AccountClass }>;
}): Record<AccountClass, TotalWithRows> => {
  const accountIndex = resolveColumnIndex(parsed, columnMap.account);
  const signedColumn = columnMap.signedAmount ?? null;
  const debitColumn = columnMap.debit ?? null;
  const creditColumn = columnMap.credit ?? null;
  if (!signedColumn && (!debitColumn || !creditColumn)) {
    throw new ValidationError("Journal template must include debit and credit.");
  }

  const classificationMap = new Map<string, AccountClass>(
    classifications.map((entry) => [
      normalizeColumnName(entry.accountCode),
      entry.classification
    ])
  );

  const totals: Record<AccountClass, TotalWithRows> = {
    EXPENSE: { totalCents: 0, rows: [] },
    NET_PAYABLE: { totalCents: 0, rows: [] },
    TAX_PAYABLE: { totalCents: 0, rows: [] },
    NI_PRSI_PAYABLE: { totalCents: 0, rows: [] },
    PENSION_PAYABLE: { totalCents: 0, rows: [] },
    CASH: { totalCents: 0, rows: [] },
    OTHER: { totalCents: 0, rows: [] }
  };

  const signedIndex = resolveOptionalColumnIndex(parsed, signedColumn);
  const debitIndex = resolveOptionalColumnIndex(parsed, debitColumn);
  const creditIndex = resolveOptionalColumnIndex(parsed, creditColumn);

  const resolveAmountCents = (row: string[]): number | null => {
    if (signedIndex !== null) {
      const parsedValue = parseAmount(row[signedIndex]);
      if (parsedValue === null || parsedValue === 0) {
        return null;
      }
      return toCents(parsedValue);
    }
    if (debitIndex === null || creditIndex === null) {
      return null;
    }
    const debitValue = parseAmount(row[debitIndex]);
    const creditValue = parseAmount(row[creditIndex]);
    const debitCents = debitValue ? toCents(Math.abs(debitValue)) : 0;
    const creditCents = creditValue ? toCents(Math.abs(creditValue)) : 0;
    if (debitCents === 0 && creditCents === 0) {
      return null;
    }
    return debitCents > 0 ? debitCents : -creditCents;
  };

  parsed.rows.forEach((row, rowIndex) => {
    if (rowIndex <= parsed.headerRowIndex) {
      return;
    }
    if (row.every((cell) => String(cell).trim().length === 0)) {
      return;
    }
    const accountValue = String(row[accountIndex] ?? "").trim();
    if (!accountValue) {
      return;
    }
    const amountCents = resolveAmountCents(row);
    if (amountCents === null) {
      return;
    }
    const classification =
      classificationMap.get(normalizeColumnName(accountValue)) ?? "OTHER";
    const entry = totals[classification];
    if (!entry) {
      return;
    }
    const normalizedAmount = Math.abs(amountCents);
    entry.totalCents += normalizedAmount;
    entry.rows.push({ rowNumber: rowIndex + 1, amountCents: normalizedAmount });
  });

  return totals;
};

const collectBankPayments = (
  parsed: ParsedImport,
  columnMap: ColumnMap
): Array<{ rowNumber: number; amountCents: number; payeeKey: string; reference: string }> => {
  const amountIndex = resolveColumnIndex(parsed, columnMap.amount);
  const payeeColumn = columnMap.payeeId ?? columnMap.payeeName ?? null;
  const payeeIndex = resolveOptionalColumnIndex(parsed, payeeColumn);
  const referenceIndex = resolveOptionalColumnIndex(parsed, columnMap.reference);

  const payments: Array<{
    rowNumber: number;
    amountCents: number;
    payeeKey: string;
    reference: string;
  }> = [];

  parsed.rows.forEach((row, rowIndex) => {
    if (rowIndex <= parsed.headerRowIndex) {
      return;
    }
    if (row.every((cell) => String(cell).trim().length === 0)) {
      return;
    }
    const parsedValue = parseAmount(row[amountIndex]);
    if (parsedValue === null) {
      return;
    }
    const amountCents = toCents(parsedValue);
    const payeeValue = payeeIndex !== null ? String(row[payeeIndex] ?? "") : "";
    const referenceValue =
      referenceIndex !== null ? String(row[referenceIndex] ?? "") : "";
    payments.push({
      rowNumber: rowIndex + 1,
      amountCents,
      payeeKey: normalizeColumnName(payeeValue) || "unknown",
      reference: normalizeColumnName(referenceValue)
    });
  });

  return payments;
};

const collectStatutoryTotals = ({
  parsed,
  columnMap,
  categoryMap
}: {
  parsed: ParsedImport;
  columnMap: ColumnMap;
  categoryMap: Record<string, StatutoryCategoryKey | null>;
}): { totals: Record<StatutoryCategoryKey, TotalWithRows>; unmapped: string[] } => {
  const categoryIndex = resolveColumnIndex(parsed, columnMap.category);
  const amountIndex = resolveColumnIndex(parsed, columnMap.amount);
  const totals = STATUTORY_CATEGORY_KEYS.reduce(
    (acc, key) => {
      acc[key] = { totalCents: 0, rows: [] };
      return acc;
    },
    {} as Record<StatutoryCategoryKey, TotalWithRows>
  );
  const unmapped = new Set<string>();

  parsed.rows.forEach((row, rowIndex) => {
    if (rowIndex <= parsed.headerRowIndex) {
      return;
    }
    if (row.every((cell) => String(cell).trim().length === 0)) {
      return;
    }
    const rawCategory = String(row[categoryIndex] ?? "").trim();
    if (!rawCategory) {
      return;
    }
    const normalizedCategory = normalizeColumnName(rawCategory);
    const mappedKey = normalizedCategory ? categoryMap[normalizedCategory] : null;
    if (!mappedKey) {
      unmapped.add(rawCategory);
      return;
    }
    const parsedValue = parseAmount(row[amountIndex]);
    if (parsedValue === null) {
      return;
    }
    const amountCents = toCents(parsedValue);
    totals[mappedKey].totalCents += amountCents;
    totals[mappedKey].rows.push({ rowNumber: rowIndex + 1, amountCents });
  });

  return { totals, unmapped: Array.from(unmapped.values()).sort() };
};

const collectPensionScheduleTotals = ({
  parsed,
  columnMap
}: {
  parsed: ParsedImport;
  columnMap: ColumnMap;
}): { total: TotalWithRows; missingReason?: string } => {
  const totalColumn = columnMap.amount ?? null;
  const employeeColumn = columnMap.pensionEmployee ?? null;
  const employerColumn = columnMap.pensionEmployer ?? null;

  if (!totalColumn && !employeeColumn && !employerColumn) {
    return {
      total: { totalCents: 0, rows: [] },
      missingReason: "Pension schedule columns are not mapped."
    };
  }

  if (totalColumn) {
    return { total: collectColumnTotals(parsed, totalColumn) };
  }

  return {
    total: combineTotals(
      collectOptionalColumnTotals(parsed, employeeColumn),
      collectOptionalColumnTotals(parsed, employerColumn)
    )
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
  if (isImportErrorStatus(entry.parseStatus)) {
    throw new ValidationError(`Import validation failed for ${source}.`);
  }
  if (entry.parseStatus === "UPLOADED" || entry.parseStatus === "PARSING") {
    throw new ValidationError(`Parse ${source} import before reconciliation.`);
  }
  if (entry.parseStatus === "MAPPING_REQUIRED") {
    throw new ValidationError(`Mapping required for ${source} import.`);
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
      firm: true,
      client: true
    }
  });

  if (!payRun) {
    throw new NotFoundError("Pay run not found.");
  }

  const accountClassifications = await prisma.accountClassification.findMany({
    where: {
      firmId: context.firmId,
      clientId: payRun.clientId
    },
    orderBy: [{ accountCode: "asc" }]
  });

  const span = startSpan("RECONCILIATION_RUN", {
    firmId: context.firmId,
    payRunId: payRun.id
  });
  let activeRunId: string | null = null;
  let activeRunNumber: number | null = null;

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

    const requiredSources = resolveRequiredSources(payRun.firm.defaults);
    const statutoryRequired = requiredSources.includes("STATUTORY");

    for (const source of requiredSources) {
      if (source === "STATUTORY") {
        continue;
      }
      ensureMappedImport(source, latestBySource.get(source));
    }

    const registerImport = ensureMappedImport(
      "REGISTER",
      latestBySource.get("REGISTER")
    );
    const bankImport = ensureMappedImport("BANK", latestBySource.get("BANK"));
    const glImport = ensureMappedImport("GL", latestBySource.get("GL"));

    const statutoryEntry = latestBySource.get("STATUTORY");
    const statutoryImport = statutoryRequired
      ? ensureMappedImport("STATUTORY", statutoryEntry)
      : statutoryEntry &&
          !isImportErrorStatus(statutoryEntry.parseStatus) &&
          statutoryEntry.parseStatus !== "UPLOADED" &&
          statutoryEntry.parseStatus !== "PARSING" &&
          statutoryEntry.parseStatus !== "MAPPING_REQUIRED" &&
          statutoryEntry.mappingTemplateVersion
        ? (statutoryEntry as ImportWithTemplate & {
            mappingTemplateVersion: MappingTemplate;
          })
        : null;
    const pensionScheduleEntry = latestBySource.get("PENSION_SCHEDULE");
    const pensionScheduleImport =
      pensionScheduleEntry &&
      !isImportErrorStatus(pensionScheduleEntry.parseStatus) &&
      pensionScheduleEntry.parseStatus !== "UPLOADED" &&
      pensionScheduleEntry.parseStatus !== "PARSING" &&
      pensionScheduleEntry.parseStatus !== "MAPPING_REQUIRED" &&
      pensionScheduleEntry.mappingTemplateVersion
        ? (pensionScheduleEntry as ImportWithTemplate & {
            mappingTemplateVersion: MappingTemplate;
          })
        : null;

    const parsedRegister = await buildParsedImport(
      registerImport,
      registerImport.mappingTemplateVersion,
      { firmId: context.firmId }
    );
    const parsedBank = await buildParsedImport(
      bankImport,
      bankImport.mappingTemplateVersion,
      { firmId: context.firmId }
    );
    const parsedGl = await buildParsedImport(
      glImport,
      glImport.mappingTemplateVersion,
      { firmId: context.firmId }
    );
    const parsedStatutory = statutoryImport
      ? await buildParsedImport(
          statutoryImport,
          statutoryImport.mappingTemplateVersion,
          { firmId: context.firmId }
        )
      : null;
    const parsedPensionSchedule = pensionScheduleImport
      ? await buildParsedImport(
          pensionScheduleImport,
          pensionScheduleImport.mappingTemplateVersion,
          { firmId: context.firmId }
        )
      : null;

    const registerColumnMap = registerImport.mappingTemplateVersion
      .columnMap as ColumnMap;
    const bankColumnMap = bankImport.mappingTemplateVersion
      .columnMap as ColumnMap;
    const glColumnMap = glImport.mappingTemplateVersion.columnMap as ColumnMap;
    const statutoryColumnMap = statutoryImport
      ? (statutoryImport.mappingTemplateVersion.columnMap as ColumnMap)
      : null;
    const pensionScheduleColumnMap = pensionScheduleImport
      ? (pensionScheduleImport.mappingTemplateVersion.columnMap as ColumnMap)
      : null;

    const registerTotals = collectColumnTotals(
      parsedRegister,
      registerColumnMap.netPay
    );
    const registerGrossTotals = collectOptionalColumnTotals(
      parsedRegister,
      registerColumnMap.grossPay
    );
    const registerTax1Totals = collectColumnTotals(
      parsedRegister,
      registerColumnMap.tax1
    );
    const registerTax2Totals = collectOptionalColumnTotals(
      parsedRegister,
      registerColumnMap.tax2
    );
    const registerTax3Totals = collectOptionalColumnTotals(
      parsedRegister,
      registerColumnMap.tax3
    );
    const registerPensionEmployeeTotals = collectOptionalColumnTotals(
      parsedRegister,
      registerColumnMap.pensionEmployee
    );
    const registerPensionEmployerTotals = collectOptionalColumnTotals(
      parsedRegister,
      registerColumnMap.pensionEmployer
    );
    const registerOtherDeductionsTotals = collectOptionalColumnTotals(
      parsedRegister,
      registerColumnMap.otherDeductions
    );
    const bankTotals = collectColumnTotals(parsedBank, bankColumnMap.amount);
    const journalTotals = collectJournalTotals(parsedGl, glColumnMap);
    const journalClassTotals = collectJournalClassTotals({
      parsed: parsedGl,
      columnMap: glColumnMap,
      classifications: accountClassifications
    });
    const bankPayments = collectBankPayments(parsedBank, bankColumnMap);

    const bundle = getBundleConfig(payRun.firm.region);
    const tolerances = resolveTolerances({
      region: payRun.firm.region,
      firmDefaults: payRun.firm.defaults,
      clientSettings: payRun.client.settings,
      payRunSettings: payRun.settings
    });
    const categoryLabels = buildStatutoryCategoryLabels(payRun.firm.region);
    const rawCategoryMap =
      (statutoryImport?.mappingTemplateVersion
        .normalizationRules as { categoryMap?: Record<string, StatutoryCategoryKey | null> } | null)
        ?.categoryMap ?? {};
    const statutoryCategoryMap = Object.fromEntries(
      Object.entries(rawCategoryMap)
        .map(([key, value]) => [normalizeColumnName(key), value])
        .filter(([key]) => Boolean(key))
    ) as Record<string, StatutoryCategoryKey | null>;
    const { totals: statutoryTotalsByCategory, unmapped: unmappedCategories } =
      statutoryImport && parsedStatutory && statutoryColumnMap
        ? collectStatutoryTotals({
            parsed: parsedStatutory,
            columnMap: statutoryColumnMap,
            categoryMap: statutoryCategoryMap
          })
        : {
            totals: STATUTORY_CATEGORY_KEYS.reduce(
              (acc, key) => {
                acc[key] = { totalCents: 0, rows: [] };
                return acc;
              },
              {} as Record<StatutoryCategoryKey, TotalWithRows>
            ),
            unmapped: []
          };
    const pensionScheduleTotalsResult =
      pensionScheduleImport && parsedPensionSchedule && pensionScheduleColumnMap
        ? collectPensionScheduleTotals({
            parsed: parsedPensionSchedule,
            columnMap: pensionScheduleColumnMap
          })
        : { total: { totalCents: 0, rows: [] } };
    const pensionScheduleTotals = pensionScheduleTotalsResult.total;

    const registerTotalsByCategory: Record<StatutoryCategoryKey, TotalWithRows> = {
      TAX_PRIMARY: registerTax1Totals,
      TAX_SECONDARY: registerTax2Totals,
      TAX_OTHER: registerTax3Totals,
      PENSION_EMPLOYEE: registerPensionEmployeeTotals,
      PENSION_EMPLOYER: registerPensionEmployerTotals,
      OTHER_DEDUCTIONS: registerOtherDeductionsTotals
    };

    const registerTaxTotals = combineTotals(
      registerTax1Totals,
      registerTax2Totals,
      registerTax3Totals
    );
    const registerEmployerCostsTotals = combineTotals(
      registerTax2Totals,
      registerPensionEmployerTotals
    );
    const registerPensionTotals = combineTotals(
      registerPensionEmployeeTotals,
      registerPensionEmployerTotals
    );
    const journalTaxTotals = combineTotals(
      journalClassTotals.TAX_PAYABLE,
      journalClassTotals.NI_PRSI_PAYABLE
    );
    const journalEmployerCostsTotals = combineTotals(
      journalClassTotals.NI_PRSI_PAYABLE,
      journalClassTotals.PENSION_PAYABLE
    );

    const classificationMissing = accountClassifications.length === 0;
    const grossMissing = !registerColumnMap.grossPay;
    const employerCostsMissing =
      !registerColumnMap.tax2 && !registerColumnMap.pensionEmployer;
    const pensionMissing =
      !registerColumnMap.pensionEmployee && !registerColumnMap.pensionEmployer;
    const pensionScheduleMissingReason = pensionScheduleTotalsResult.missingReason;

    const expectedVariances = await prisma.expectedVariance.findMany({
      where: {
        firmId: context.firmId,
        clientId: payRun.clientId,
        active: true
      },
      orderBy: { createdAt: "asc" }
    });

    const pensionScheduleSkipReason = pensionMissing
      ? "Register pension columns are not mapped."
      : pensionScheduleMissingReason;

    const evaluations: CheckEvaluation[] = [
      evaluateRegisterNetToBankTotal({
        register: registerTotals,
        bank: bankTotals,
        registerImportId: registerImport.id,
        bankImportId: bankImport.id,
        tolerance: tolerances.registerNetToBank
      }),
      evaluateJournalDebitsEqualCredits({
        debits: journalTotals.debits,
        credits: journalTotals.credits,
        glImportId: glImport.id,
        tolerance: tolerances.journalBalance
      }),
      evaluateRegisterDeductionsToStatutoryTotals({
        registerTotalsByCategory,
        statutoryTotalsByCategory,
        registerImportId: registerImport.id,
        statutoryImportId: statutoryImport?.id ?? null,
        tolerance: tolerances.statutoryTotals,
        categoryLabels,
        unmappedCategories
      }),
      evaluateRegisterPensionToScheduleTotal({
        registerTotal: registerPensionTotals,
        scheduleTotal: pensionScheduleTotals,
        registerImportId: registerImport.id,
        scheduleImportId: pensionScheduleImport?.id ?? null,
        tolerance: tolerances.statutoryTotals,
        missingReason: pensionScheduleSkipReason
      }),
      evaluateRegisterToJournalTotal({
        checkType: "CHK_REGISTER_GROSS_TO_JOURNAL_EXPENSE",
        registerTotal: registerGrossTotals,
        journalTotal: journalClassTotals.EXPENSE,
        registerImportId: registerImport.id,
        journalImportId: glImport.id,
        tolerance: tolerances.journalTieOut,
        leftLabel: "Register gross total",
        rightLabel: "Journal payroll expense total",
        missingReason: classificationMissing
          ? "Account classifications are required to reconcile journal totals."
          : grossMissing
            ? "Register gross pay is not mapped."
            : undefined
      }),
      evaluateRegisterToJournalTotal({
        checkType: "CHK_REGISTER_EMPLOYER_COSTS_TO_JOURNAL_EXPENSE",
        registerTotal: registerEmployerCostsTotals,
        journalTotal: journalEmployerCostsTotals,
        registerImportId: registerImport.id,
        journalImportId: glImport.id,
        tolerance: tolerances.journalTieOut,
        leftLabel: "Register employer costs total",
        rightLabel: "Journal employer costs total",
        missingReason: classificationMissing
          ? "Account classifications are required to reconcile journal totals."
          : employerCostsMissing
            ? "Register employer cost columns are not mapped."
            : undefined
      }),
      evaluateRegisterToJournalTotal({
        checkType: "CHK_REGISTER_NET_PAY_TO_JOURNAL_LIABILITY",
        registerTotal: registerTotals,
        journalTotal: journalClassTotals.NET_PAYABLE,
        registerImportId: registerImport.id,
        journalImportId: glImport.id,
        tolerance: tolerances.journalTieOut,
        leftLabel: "Register net pay total",
        rightLabel: "Journal net wages liability",
        missingReason: classificationMissing
          ? "Account classifications are required to reconcile journal totals."
          : undefined
      }),
      evaluateRegisterToJournalTotal({
        checkType: "CHK_REGISTER_TAX_TO_JOURNAL_LIABILITY",
        registerTotal: registerTaxTotals,
        journalTotal: journalTaxTotals,
        registerImportId: registerImport.id,
        journalImportId: glImport.id,
        tolerance: tolerances.journalTieOut,
        leftLabel: "Register tax liabilities total",
        rightLabel: "Journal tax liabilities total",
        missingReason: classificationMissing
          ? "Account classifications are required to reconcile journal totals."
          : undefined
      }),
      evaluateRegisterToJournalTotal({
        checkType: "CHK_REGISTER_PENSION_TO_JOURNAL_LIABILITY",
        registerTotal: registerPensionTotals,
        journalTotal: journalClassTotals.PENSION_PAYABLE,
        registerImportId: registerImport.id,
        journalImportId: glImport.id,
        tolerance: tolerances.journalTieOut,
        leftLabel: "Register pension liabilities total",
        rightLabel: "Journal pension liability total",
        missingReason: classificationMissing
          ? "Account classifications are required to reconcile journal totals."
          : pensionMissing
            ? "Register pension columns are not mapped."
            : undefined
      }),
      evaluateBankDuplicatePayments({
        duplicateRows: (() => {
          const duplicates: TotalWithRows["rows"] = [];
          const seen = new Map<string, TotalWithRows["rows"]>();
          for (const payment of bankPayments) {
            const key = `${payment.payeeKey}|${payment.amountCents}|${payment.reference}`;
            const bucket = seen.get(key) ?? [];
            bucket.push({
              rowNumber: payment.rowNumber,
              amountCents: Math.abs(payment.amountCents)
            });
            seen.set(key, bucket);
          }
          for (const bucket of seen.values()) {
            if (bucket.length > 1) {
              duplicates.push(...bucket);
            }
          }
          return duplicates;
        })(),
        bankImportId: bankImport.id
      }),
      evaluateBankNegativePayments({
        negativeRows: bankPayments
          .filter((payment) => payment.amountCents <= 0)
          .map((payment) => ({
            rowNumber: payment.rowNumber,
            amountCents: Math.abs(payment.amountCents)
          })),
        bankImportId: bankImport.id
      }),
      evaluateBankPaymentCountMismatch({
        registerCount: registerTotals.rows.filter((row) => row.amountCents > 0)
          .length,
        bankCount: bankPayments.filter((payment) => payment.amountCents > 0).length,
        tolerancePercent: tolerances.bankCountMismatchPercent
      })
    ].map((evaluation) =>
      applyExpectedVariances({
        evaluation,
        expectedVariances,
        bankPayments
      })
    );

    const latestRun = await prisma.reconciliationRun.findFirst({
      where: {
        payRunId: payRun.id
      },
      orderBy: { runNumber: "desc" }
    });
    const runNumber = latestRun ? latestRun.runNumber + 1 : 1;
    activeRunNumber = runNumber;

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
        },
        ...(statutoryImport
          ? {
              STATUTORY: {
                importId: statutoryImport.id,
                version: statutoryImport.version,
                templateId: statutoryImport.mappingTemplateVersionId
              }
            }
          : {}),
        ...(pensionScheduleImport
          ? {
              PENSION_SCHEDULE: {
                importId: pensionScheduleImport.id,
                version: pensionScheduleImport.version,
                templateId: pensionScheduleImport.mappingTemplateVersionId
              }
            }
          : {})
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
    const run = await prisma.reconciliationRun.create({
      data: {
        firmId: context.firmId,
        payRunId: payRun.id,
        runNumber,
        bundleId: bundle.bundleId,
        bundleVersion: bundle.bundleVersion,
        status: "RUNNING",
        inputSummary,
        executedByUserId: context.userId
      }
    });
    activeRunId = run.id;

    await prisma.$transaction(async (tx) => {
      await tx.reconciliationRun.update({
        where: { id: run.id },
        data: { status: "SUCCESS" }
      });

      await tx.reconciliationRun.updateMany({
        where: {
          payRunId: payRun.id,
          supersededAt: null,
          id: { not: run.id }
        },
        data: {
          supersededAt,
          supersededByRunId: run.id
        }
      });

      await tx.exception.updateMany({
        where: {
          payRunId: payRun.id,
          supersededAt: null
        },
        data: {
          supersededAt,
          supersededByRunId: run.id
        }
      });

      for (const evaluation of evaluations) {
        const checkResult = await tx.checkResult.create({
          data: {
            reconciliationRunId: run.id,
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
              reconciliationRunId: run.id,
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
    if (activeRunId) {
      try {
        await prisma.reconciliationRun.update({
          where: { id: activeRunId },
          data: { status: "FAILED" }
        });
        if (activeRunNumber !== null) {
          await recordAuditEvent(
            {
              action: "RECONCILIATION_COMPLETED",
              entityType: "PAY_RUN",
              entityId: payRunId,
              metadata: {
                runNumber: activeRunNumber,
                status: "FAILED"
              }
            },
            {
              firmId: context.firmId,
              actorUserId: context.userId
            }
          );
        }
      } catch {
        // Swallow status update failures to preserve the original error.
      }
    }
    throw error;
  }
};
