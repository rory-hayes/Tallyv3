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
