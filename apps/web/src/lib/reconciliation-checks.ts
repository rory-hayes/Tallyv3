import "server-only";

import type {
  CheckSeverity,
  CheckStatus,
  CheckType,
  ExceptionCategory
} from "@/lib/prisma";

export type AmountRow = {
  rowNumber: number;
  amountCents: number;
};

export type TotalWithRows = {
  totalCents: number;
  rows: AmountRow[];
};

export type EvidencePointer = {
  importId: string;
  rowNumbers: number[];
  note?: string;
};

export type CategoryBreakdown = {
  category: string;
  registerTotal: number;
  statutoryTotal: number;
  delta: number;
  withinTolerance: boolean;
};

export type CheckDetails = {
  leftLabel: string;
  rightLabel: string;
  leftValue: number;
  rightValue: number;
  deltaValue: number;
  deltaPercent: number;
  formula: string;
  toleranceApplied: {
    absolute: number;
    percent: number;
    applied: number;
  };
  categoryBreakdown?: CategoryBreakdown[];
  unmappedCategories?: string[];
  expectedVariance?: {
    id: string;
    varianceType: string;
    downgradeTo: CheckStatus;
    requiresNote?: boolean;
    requiresAttachment?: boolean;
    requiresReviewerAck?: boolean;
  };
};

export type CheckEvaluation = {
  checkType: CheckType;
  checkVersion: string;
  status: CheckStatus;
  severity: CheckSeverity;
  summary: string;
  details: CheckDetails;
  evidence?: EvidencePointer[];
  exception?:
    | {
        category: ExceptionCategory;
        title: string;
        description: string;
        evidence?: EvidencePointer[];
      }
    | null;
};

export type CheckTolerance = {
  absoluteCents: number;
  percent: number;
};

const CHECK_VERSION = "v1";
const MAX_EVIDENCE_ROWS = 5;

const centsToAmount = (cents: number): number =>
  Number((cents / 100).toFixed(2));

const calcToleranceCents = (
  absoluteCents: number,
  percent: number,
  baseCents: number
): number => {
  if (baseCents === 0) {
    return absoluteCents;
  }
  const percentCents = Math.round(Math.abs(baseCents) * (percent / 100));
  return Math.max(absoluteCents, percentCents);
};

const buildEvidence = (
  importId: string,
  rows: AmountRow[],
  note: string
): EvidencePointer => {
  const rowNumbers = [...rows]
    .sort((left, right) => {
      const diff = Math.abs(right.amountCents) - Math.abs(left.amountCents);
      if (diff !== 0) {
        return diff;
      }
      return left.rowNumber - right.rowNumber;
    })
    .slice(0, MAX_EVIDENCE_ROWS)
    .map((row) => row.rowNumber);

  return { importId, rowNumbers, note };
};

const buildTotalsDetails = ({
  leftLabel,
  rightLabel,
  leftTotalCents,
  rightTotalCents,
  tolerance
}: {
  leftLabel: string;
  rightLabel: string;
  leftTotalCents: number;
  rightTotalCents: number;
  tolerance: CheckTolerance;
}): { details: CheckDetails; deltaCents: number; toleranceCents: number } => {
  const deltaCents = leftTotalCents - rightTotalCents;
  const toleranceCents = calcToleranceCents(
    tolerance.absoluteCents,
    tolerance.percent,
    leftTotalCents
  );
  const deltaPercent =
    leftTotalCents === 0
      ? 0
      : Number(
          (
            (Math.abs(deltaCents) / Math.abs(leftTotalCents)) *
            100
          ).toFixed(4)
        );

  return {
    deltaCents,
    toleranceCents,
    details: {
      leftLabel,
      rightLabel,
      leftValue: centsToAmount(leftTotalCents),
      rightValue: centsToAmount(rightTotalCents),
      deltaValue: centsToAmount(deltaCents),
      deltaPercent,
      formula: `${leftLabel} - ${rightLabel}`,
      toleranceApplied: {
        absolute: centsToAmount(tolerance.absoluteCents),
        percent: tolerance.percent,
        applied: centsToAmount(toleranceCents)
      }
    }
  };
};

const buildSkippedDetails = ({
  leftLabel,
  rightLabel,
  reason
}: {
  leftLabel: string;
  rightLabel: string;
  reason: string;
}): CheckDetails => ({
  leftLabel,
  rightLabel,
  leftValue: 0,
  rightValue: 0,
  deltaValue: 0,
  deltaPercent: 0,
  formula: reason,
  toleranceApplied: {
    absolute: 0,
    percent: 0,
    applied: 0
  }
});

const buildCountDetails = ({
  leftLabel,
  rightLabel,
  leftValue,
  rightValue,
  tolerance
}: {
  leftLabel: string;
  rightLabel: string;
  leftValue: number;
  rightValue: number;
  tolerance: { absolute: number; percent: number };
}): { details: CheckDetails; delta: number; toleranceApplied: number } => {
  const delta = leftValue - rightValue;
  const toleranceApplied =
    leftValue === 0
      ? tolerance.absolute
      : Math.max(tolerance.absolute, Math.abs(leftValue) * (tolerance.percent / 100));
  const deltaPercent =
    leftValue === 0
      ? 0
      : Number(((Math.abs(delta) / Math.abs(leftValue)) * 100).toFixed(4));
  return {
    delta,
    toleranceApplied,
    details: {
      leftLabel,
      rightLabel,
      leftValue,
      rightValue,
      deltaValue: delta,
      deltaPercent,
      formula: `${leftLabel} - ${rightLabel}`,
      toleranceApplied: {
        absolute: tolerance.absolute,
        percent: tolerance.percent,
        applied: Number(toleranceApplied.toFixed(2))
      }
    }
  };
};

export const evaluateRegisterNetToBankTotal = ({
  register,
  bank,
  registerImportId,
  bankImportId,
  tolerance
}: {
  register: TotalWithRows;
  bank: TotalWithRows;
  registerImportId: string;
  bankImportId: string;
  tolerance: CheckTolerance;
}): CheckEvaluation => {
  const { details, deltaCents, toleranceCents } = buildTotalsDetails({
    leftLabel: "Register net total",
    rightLabel: "Bank total",
    leftTotalCents: register.totalCents,
    rightTotalCents: bank.totalCents,
    tolerance
  });

  const isWithinTolerance = Math.abs(deltaCents) <= toleranceCents;
  const status: CheckStatus = isWithinTolerance ? "PASS" : "FAIL";
  const severity: CheckSeverity = isWithinTolerance ? "INFO" : "CRITICAL";
  const summary = isWithinTolerance
    ? "Register net total matches bank total within tolerance."
    : "Register net total differs from bank total beyond tolerance.";

  const evidence = [
    buildEvidence(registerImportId, register.rows, "Top register net rows"),
    buildEvidence(bankImportId, bank.rows, "Top bank payment rows")
  ];

  return {
    checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
    checkVersion: CHECK_VERSION,
    status,
    severity,
    summary,
    details,
    evidence,
    exception: isWithinTolerance
      ? null
      : {
          category: "BANK_MISMATCH",
          title: "Register net total does not match bank total",
          description:
            "Net pay totals differ between the register and bank sources.",
          evidence
        }
  };
};

export const evaluateRegisterDeductionsToStatutoryTotals = ({
  registerTotalsByCategory,
  statutoryTotalsByCategory,
  registerImportId,
  statutoryImportId,
  tolerance,
  categoryLabels,
  unmappedCategories
}: {
  registerTotalsByCategory: Record<string, TotalWithRows>;
  statutoryTotalsByCategory: Record<string, TotalWithRows>;
  registerImportId: string;
  statutoryImportId: string | null;
  tolerance: CheckTolerance;
  categoryLabels: Record<string, string>;
  unmappedCategories: string[];
}): CheckEvaluation => {
  if (!statutoryImportId) {
    return {
      checkType: "CHK_REGISTER_DEDUCTIONS_TO_STATUTORY_TOTALS",
      checkVersion: CHECK_VERSION,
      status: "WARN",
      severity: "LOW",
      summary: "Statutory totals import is missing; statutory checks skipped.",
      details: buildSkippedDetails({
        leftLabel: "Register deductions total",
        rightLabel: "Statutory totals",
        reason: "Statutory import missing"
      })
    };
  }

  const categories = Object.keys(registerTotalsByCategory);
  if (categories.length === 0) {
    return {
      checkType: "CHK_REGISTER_DEDUCTIONS_TO_STATUTORY_TOTALS",
      checkVersion: CHECK_VERSION,
      status: "WARN",
      severity: "LOW",
      summary: "No register deductions are mapped for statutory comparison.",
      details: buildSkippedDetails({
        leftLabel: "Register deductions total",
        rightLabel: "Statutory totals",
        reason: "Register deductions missing"
      })
    };
  }

  let totalRegisterCents = 0;
  let totalStatutoryCents = 0;
  const categoryBreakdown: CategoryBreakdown[] = [];
  let hasMismatch = false;
  const mismatchedCategories = new Set<string>();

  for (const category of categories) {
    const registerTotal = registerTotalsByCategory[category]?.totalCents ?? 0;
    const statutoryTotal = statutoryTotalsByCategory[category]?.totalCents ?? 0;
    totalRegisterCents += registerTotal;
    totalStatutoryCents += statutoryTotal;

    const deltaCents = registerTotal - statutoryTotal;
    const toleranceCents = calcToleranceCents(
      tolerance.absoluteCents,
      tolerance.percent,
      registerTotal
    );
    const withinTolerance = Math.abs(deltaCents) <= toleranceCents;
    if (!withinTolerance) {
      hasMismatch = true;
      mismatchedCategories.add(category);
    }
    categoryBreakdown.push({
      category: categoryLabels[category] ?? category,
      registerTotal: centsToAmount(registerTotal),
      statutoryTotal: centsToAmount(statutoryTotal),
      delta: centsToAmount(deltaCents),
      withinTolerance
    });
  }

  const { details } = buildTotalsDetails({
    leftLabel: "Register deductions total",
    rightLabel: "Statutory totals",
    leftTotalCents: totalRegisterCents,
    rightTotalCents: totalStatutoryCents,
    tolerance
  });

  const registerRows = categories.flatMap((category) => {
    if (!mismatchedCategories.has(category)) {
      return [];
    }
    return registerTotalsByCategory[category]?.rows ?? [];
  });
  const statutoryRows = categories.flatMap((category) => {
    if (!mismatchedCategories.has(category)) {
      return [];
    }
    return statutoryTotalsByCategory[category]?.rows ?? [];
  });

  const evidence =
    mismatchedCategories.size > 0
      ? [
          buildEvidence(
            registerImportId,
            registerRows,
            "Register deduction rows"
          ),
          buildEvidence(
            statutoryImportId,
            statutoryRows,
            "Statutory category rows"
          )
        ]
      : undefined;

  return {
    checkType: "CHK_REGISTER_DEDUCTIONS_TO_STATUTORY_TOTALS",
    checkVersion: CHECK_VERSION,
    status: hasMismatch ? "FAIL" : "PASS",
    severity: hasMismatch ? "HIGH" : "INFO",
    summary: hasMismatch
      ? "Register deductions differ from statutory totals beyond tolerance."
      : "Register deductions match statutory totals within tolerance.",
    details: {
      ...details,
      categoryBreakdown,
      unmappedCategories: unmappedCategories.length > 0 ? unmappedCategories : undefined
    },
    evidence,
    exception: hasMismatch
      ? {
          category: "STATUTORY_MISMATCH",
          title: "Register deductions do not match statutory totals",
          description: "Statutory categories are out of tolerance.",
          evidence
        }
      : null
  };
};

export const evaluateRegisterPensionToScheduleTotal = ({
  registerTotal,
  scheduleTotal,
  registerImportId,
  scheduleImportId,
  tolerance,
  missingReason
}: {
  registerTotal: TotalWithRows;
  scheduleTotal: TotalWithRows;
  registerImportId: string;
  scheduleImportId: string | null;
  tolerance: CheckTolerance;
  missingReason?: string;
}): CheckEvaluation => {
  if (!scheduleImportId) {
    return {
      checkType: "CHK_REGISTER_PENSION_TO_PENSION_SCHEDULE",
      checkVersion: CHECK_VERSION,
      status: "WARN",
      severity: "LOW",
      summary: "Pension schedule import is missing; pension schedule check skipped.",
      details: buildSkippedDetails({
        leftLabel: "Register pension total",
        rightLabel: "Pension schedule total",
        reason: "Pension schedule missing"
      })
    };
  }

  if (missingReason) {
    return {
      checkType: "CHK_REGISTER_PENSION_TO_PENSION_SCHEDULE",
      checkVersion: CHECK_VERSION,
      status: "WARN",
      severity: "LOW",
      summary: missingReason,
      details: buildSkippedDetails({
        leftLabel: "Register pension total",
        rightLabel: "Pension schedule total",
        reason: missingReason
      })
    };
  }

  const { details, deltaCents, toleranceCents } = buildTotalsDetails({
    leftLabel: "Register pension total",
    rightLabel: "Pension schedule total",
    leftTotalCents: registerTotal.totalCents,
    rightTotalCents: scheduleTotal.totalCents,
    tolerance
  });

  const isWithinTolerance = Math.abs(deltaCents) <= toleranceCents;
  const status: CheckStatus = isWithinTolerance ? "PASS" : "FAIL";
  const severity: CheckSeverity = isWithinTolerance ? "INFO" : "HIGH";
  const summary = isWithinTolerance
    ? "Register pension total matches pension schedule within tolerance."
    : "Register pension total differs from pension schedule beyond tolerance.";

  const evidence = [
    buildEvidence(registerImportId, registerTotal.rows, "Register pension rows"),
    buildEvidence(scheduleImportId, scheduleTotal.rows, "Pension schedule rows")
  ];

  return {
    checkType: "CHK_REGISTER_PENSION_TO_PENSION_SCHEDULE",
    checkVersion: CHECK_VERSION,
    status,
    severity,
    summary,
    details,
    evidence,
    exception: isWithinTolerance
      ? null
      : {
          category: "SANITY",
          title: "Register pension total does not match pension schedule",
          description: "Pension schedule totals differ from the register totals.",
          evidence
        }
  };
};

export const evaluateRegisterToJournalTotal = ({
  checkType,
  registerTotal,
  journalTotal,
  registerImportId,
  journalImportId,
  tolerance,
  leftLabel,
  rightLabel,
  missingReason
}: {
  checkType: CheckType;
  registerTotal: TotalWithRows;
  journalTotal: TotalWithRows;
  registerImportId: string;
  journalImportId: string;
  tolerance: CheckTolerance;
  leftLabel: string;
  rightLabel: string;
  missingReason?: string;
}): CheckEvaluation => {
  if (missingReason) {
    return {
      checkType,
      checkVersion: CHECK_VERSION,
      status: "WARN",
      severity: "LOW",
      summary: missingReason,
      details: buildSkippedDetails({ leftLabel, rightLabel, reason: missingReason })
    };
  }

  const { details, deltaCents, toleranceCents } = buildTotalsDetails({
    leftLabel,
    rightLabel,
    leftTotalCents: registerTotal.totalCents,
    rightTotalCents: journalTotal.totalCents,
    tolerance
  });

  const isWithinTolerance = Math.abs(deltaCents) <= toleranceCents;
  const status: CheckStatus = isWithinTolerance ? "PASS" : "FAIL";
  const severity: CheckSeverity = isWithinTolerance ? "INFO" : "HIGH";
  const summary = isWithinTolerance
    ? `${leftLabel} matches ${rightLabel} within tolerance.`
    : `${leftLabel} differs from ${rightLabel} beyond tolerance.`;

  const evidence = [
    buildEvidence(registerImportId, registerTotal.rows, "Register rows"),
    buildEvidence(journalImportId, journalTotal.rows, "Journal rows")
  ];

  return {
    checkType,
    checkVersion: CHECK_VERSION,
    status,
    severity,
    summary,
    details,
    evidence,
    exception: isWithinTolerance
      ? null
      : {
          category: "JOURNAL_MISMATCH",
          title: "Register totals do not match journal totals",
          description: "Journal allocations differ from the register totals.",
          evidence
        }
  };
};

export const evaluateBankDuplicatePayments = ({
  duplicateRows,
  bankImportId
}: {
  duplicateRows: AmountRow[];
  bankImportId: string;
}): CheckEvaluation => {
  const hasDuplicates = duplicateRows.length > 0;
  const { details } = buildCountDetails({
    leftLabel: "Duplicate payment rows",
    rightLabel: "Expected duplicates",
    leftValue: duplicateRows.length,
    rightValue: 0,
    tolerance: { absolute: 0, percent: 0 }
  });

  const evidence = hasDuplicates
    ? [buildEvidence(bankImportId, duplicateRows, "Duplicate payment rows")]
    : undefined;

  return {
    checkType: "CHK_BANK_DUPLICATE_PAYMENTS",
    checkVersion: CHECK_VERSION,
    status: hasDuplicates ? "FAIL" : "PASS",
    severity: hasDuplicates ? "HIGH" : "INFO",
    summary: hasDuplicates
      ? "Duplicate bank payments detected."
      : "No duplicate bank payments detected.",
    details,
    evidence,
    exception: hasDuplicates
      ? {
          category: "BANK_DATA_QUALITY",
          title: "Duplicate bank payments detected",
          description: "Multiple payments share the same payee and amount.",
          evidence
        }
      : null
  };
};

export const evaluateBankNegativePayments = ({
  negativeRows,
  bankImportId
}: {
  negativeRows: AmountRow[];
  bankImportId: string;
}): CheckEvaluation => {
  const hasNegatives = negativeRows.length > 0;
  const { details } = buildCountDetails({
    leftLabel: "Zero or negative payments",
    rightLabel: "Expected zero",
    leftValue: negativeRows.length,
    rightValue: 0,
    tolerance: { absolute: 0, percent: 0 }
  });

  const evidence = hasNegatives
    ? [buildEvidence(bankImportId, negativeRows, "Zero/negative payments")]
    : undefined;

  return {
    checkType: "CHK_BANK_NEGATIVE_PAYMENTS",
    checkVersion: CHECK_VERSION,
    status: hasNegatives ? "FAIL" : "PASS",
    severity: hasNegatives ? "HIGH" : "INFO",
    summary: hasNegatives
      ? "Zero or negative bank payments detected."
      : "No zero or negative bank payments detected.",
    details,
    evidence,
    exception: hasNegatives
      ? {
          category: "BANK_DATA_QUALITY",
          title: "Zero or negative bank payments detected",
          description: "Bank payments include zero or negative values.",
          evidence
        }
      : null
  };
};

export const evaluateBankPaymentCountMismatch = ({
  registerCount,
  bankCount,
  tolerancePercent
}: {
  registerCount: number;
  bankCount: number;
  tolerancePercent: number;
}): CheckEvaluation => {
  const { details, delta, toleranceApplied } = buildCountDetails({
    leftLabel: "Register paid employees",
    rightLabel: "Bank payment count",
    leftValue: registerCount,
    rightValue: bankCount,
    tolerance: { absolute: 1, percent: tolerancePercent }
  });

  const isWithinTolerance = Math.abs(delta) <= toleranceApplied;
  return {
    checkType: "CHK_BANK_PAYMENT_COUNT_MISMATCH",
    checkVersion: CHECK_VERSION,
    status: isWithinTolerance ? "PASS" : "WARN",
    severity: isWithinTolerance ? "INFO" : "LOW",
    summary: isWithinTolerance
      ? "Bank payment count aligns with register."
      : "Bank payment count differs from register beyond tolerance.",
    details
  };
};

export const evaluateJournalDebitsEqualCredits = ({
  debits,
  credits,
  glImportId,
  tolerance
}: {
  debits: TotalWithRows;
  credits: TotalWithRows;
  glImportId: string;
  tolerance: CheckTolerance;
}): CheckEvaluation => {
  const { details, deltaCents, toleranceCents } = buildTotalsDetails({
    leftLabel: "Journal debits total",
    rightLabel: "Journal credits total",
    leftTotalCents: debits.totalCents,
    rightTotalCents: credits.totalCents,
    tolerance
  });

  const isWithinTolerance = Math.abs(deltaCents) <= toleranceCents;
  const status: CheckStatus = isWithinTolerance ? "PASS" : "FAIL";
  const severity: CheckSeverity = isWithinTolerance ? "INFO" : "HIGH";
  const summary = isWithinTolerance
    ? "Journal debits and credits balance within tolerance."
    : "Journal debits and credits are out of balance.";

  const evidence = [
    buildEvidence(glImportId, debits.rows, "Top debit rows"),
    buildEvidence(glImportId, credits.rows, "Top credit rows")
  ];

  return {
    checkType: "CHK_JOURNAL_DEBITS_EQUAL_CREDITS",
    checkVersion: CHECK_VERSION,
    status,
    severity,
    summary,
    details,
    evidence,
    exception: isWithinTolerance
      ? null
      : {
          category: "JOURNAL_MISMATCH",
          title: "Journal debits do not equal credits",
          description:
            "The journal debits and credits are not balanced within tolerance.",
          evidence
        }
  };
};
