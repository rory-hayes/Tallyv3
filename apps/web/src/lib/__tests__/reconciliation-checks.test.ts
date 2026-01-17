import { describe, expect, it } from "vitest";
import {
  evaluateJournalDebitsEqualCredits,
  evaluateRegisterNetToBankTotal
} from "@/lib/reconciliation-checks";

describe("reconciliation checks", () => {
  it("passes when register and bank totals match within tolerance", () => {
    const result = evaluateRegisterNetToBankTotal({
      register: { totalCents: 10000, rows: [] },
      bank: { totalCents: 10050, rows: [] },
      registerImportId: "reg-1",
      bankImportId: "bank-1",
      tolerance: { absoluteCents: 100, percent: 0.05 }
    });

    expect(result.status).toBe("PASS");
    expect(result.exception).toBeNull();
  });

  it("handles zero totals and stable evidence ordering", () => {
    const result = evaluateRegisterNetToBankTotal({
      register: {
        totalCents: 0,
        rows: [
          { rowNumber: 2, amountCents: 100 },
          { rowNumber: 1, amountCents: 100 }
        ]
      },
      bank: { totalCents: 0, rows: [] },
      registerImportId: "reg-zero",
      bankImportId: "bank-zero",
      tolerance: { absoluteCents: 100, percent: 0.05 }
    });

    expect(result.details.deltaPercent).toBe(0);
    expect(result.evidence?.[0]?.rowNumbers).toEqual([1, 2]);
  });

  it("fails when register and bank totals exceed tolerance", () => {
    const result = evaluateRegisterNetToBankTotal({
      register: { totalCents: 10000, rows: [] },
      bank: { totalCents: 10300, rows: [] },
      registerImportId: "reg-2",
      bankImportId: "bank-2",
      tolerance: { absoluteCents: 100, percent: 0.05 }
    });

    expect(result.status).toBe("FAIL");
    expect(result.exception?.category).toBe("BANK_MISMATCH");
  });

  it("passes when journal debits and credits balance", () => {
    const result = evaluateJournalDebitsEqualCredits({
      debits: { totalCents: 25000, rows: [] },
      credits: { totalCents: 25000, rows: [] },
      glImportId: "gl-1",
      tolerance: { absoluteCents: 50, percent: 0.01 }
    });

    expect(result.status).toBe("PASS");
    expect(result.exception).toBeNull();
  });

  it("fails when journal debits and credits are out of balance", () => {
    const result = evaluateJournalDebitsEqualCredits({
      debits: { totalCents: 25000, rows: [] },
      credits: { totalCents: 24000, rows: [] },
      glImportId: "gl-2",
      tolerance: { absoluteCents: 50, percent: 0.01 }
    });

    expect(result.status).toBe("FAIL");
    expect(result.exception?.category).toBe("JOURNAL_MISMATCH");
  });
});
