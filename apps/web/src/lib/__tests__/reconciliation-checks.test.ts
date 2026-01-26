import { describe, expect, it } from "vitest";
import {
  evaluateBankDuplicatePayments,
  evaluateBankNegativePayments,
  evaluateBankPaymentCountMismatch,
  evaluateJournalDebitsEqualCredits,
  evaluateRegisterDeductionsToStatutoryTotals,
  evaluateRegisterNetToBankTotal,
  evaluateRegisterPensionToScheduleTotal
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

  it("warns when statutory import is missing", () => {
    const result = evaluateRegisterDeductionsToStatutoryTotals({
      registerTotalsByCategory: {
        TAX_PRIMARY: { totalCents: 1000, rows: [] },
        TAX_SECONDARY: { totalCents: 500, rows: [] },
        TAX_OTHER: { totalCents: 0, rows: [] },
        PENSION_EMPLOYEE: { totalCents: 0, rows: [] },
        PENSION_EMPLOYER: { totalCents: 0, rows: [] },
        OTHER_DEDUCTIONS: { totalCents: 0, rows: [] }
      },
      statutoryTotalsByCategory: {
        TAX_PRIMARY: { totalCents: 0, rows: [] },
        TAX_SECONDARY: { totalCents: 0, rows: [] },
        TAX_OTHER: { totalCents: 0, rows: [] },
        PENSION_EMPLOYEE: { totalCents: 0, rows: [] },
        PENSION_EMPLOYER: { totalCents: 0, rows: [] },
        OTHER_DEDUCTIONS: { totalCents: 0, rows: [] }
      },
      registerImportId: "reg-1",
      statutoryImportId: null,
      tolerance: { absoluteCents: 100, percent: 0.05 },
      categoryLabels: {
        TAX_PRIMARY: "PAYE",
        TAX_SECONDARY: "NI",
        TAX_OTHER: "Other tax",
        PENSION_EMPLOYEE: "Pension employee",
        PENSION_EMPLOYER: "Pension employer",
        OTHER_DEDUCTIONS: "Other deductions"
      },
      unmappedCategories: []
    });

    expect(result.status).toBe("WARN");
  });

  it("fails when statutory totals differ beyond tolerance", () => {
    const result = evaluateRegisterDeductionsToStatutoryTotals({
      registerTotalsByCategory: {
        TAX_PRIMARY: { totalCents: 10000, rows: [] },
        TAX_SECONDARY: { totalCents: 0, rows: [] },
        TAX_OTHER: { totalCents: 0, rows: [] },
        PENSION_EMPLOYEE: { totalCents: 0, rows: [] },
        PENSION_EMPLOYER: { totalCents: 0, rows: [] },
        OTHER_DEDUCTIONS: { totalCents: 0, rows: [] }
      },
      statutoryTotalsByCategory: {
        TAX_PRIMARY: { totalCents: 8500, rows: [] },
        TAX_SECONDARY: { totalCents: 0, rows: [] },
        TAX_OTHER: { totalCents: 0, rows: [] },
        PENSION_EMPLOYEE: { totalCents: 0, rows: [] },
        PENSION_EMPLOYER: { totalCents: 0, rows: [] },
        OTHER_DEDUCTIONS: { totalCents: 0, rows: [] }
      },
      registerImportId: "reg-2",
      statutoryImportId: "stat-1",
      tolerance: { absoluteCents: 100, percent: 0.05 },
      categoryLabels: {
        TAX_PRIMARY: "PAYE",
        TAX_SECONDARY: "NI",
        TAX_OTHER: "Other tax",
        PENSION_EMPLOYEE: "Pension employee",
        PENSION_EMPLOYER: "Pension employer",
        OTHER_DEDUCTIONS: "Other deductions"
      },
      unmappedCategories: []
    });

    expect(result.status).toBe("FAIL");
    expect(result.exception?.category).toBe("STATUTORY_MISMATCH");
  });

  it("passes when statutory totals match within tolerance", () => {
    const result = evaluateRegisterDeductionsToStatutoryTotals({
      registerTotalsByCategory: {
        TAX_PRIMARY: { totalCents: 10000, rows: [] },
        TAX_SECONDARY: { totalCents: 0, rows: [] },
        TAX_OTHER: { totalCents: 0, rows: [] },
        PENSION_EMPLOYEE: { totalCents: 0, rows: [] },
        PENSION_EMPLOYER: { totalCents: 0, rows: [] },
        OTHER_DEDUCTIONS: { totalCents: 0, rows: [] }
      },
      statutoryTotalsByCategory: {
        TAX_PRIMARY: { totalCents: 10050, rows: [] },
        TAX_SECONDARY: { totalCents: 0, rows: [] },
        TAX_OTHER: { totalCents: 0, rows: [] },
        PENSION_EMPLOYEE: { totalCents: 0, rows: [] },
        PENSION_EMPLOYER: { totalCents: 0, rows: [] },
        OTHER_DEDUCTIONS: { totalCents: 0, rows: [] }
      },
      registerImportId: "reg-3",
      statutoryImportId: "stat-2",
      tolerance: { absoluteCents: 100, percent: 0.05 },
      categoryLabels: {
        TAX_PRIMARY: "PAYE",
        TAX_SECONDARY: "NI",
        TAX_OTHER: "Other tax",
        PENSION_EMPLOYEE: "Pension employee",
        PENSION_EMPLOYER: "Pension employer",
        OTHER_DEDUCTIONS: "Other deductions"
      },
      unmappedCategories: []
    });

    expect(result.status).toBe("PASS");
    expect(result.exception).toBeNull();
  });

  it("warns when pension schedule is missing", () => {
    const result = evaluateRegisterPensionToScheduleTotal({
      registerTotal: { totalCents: 5000, rows: [] },
      scheduleTotal: { totalCents: 0, rows: [] },
      registerImportId: "reg-1",
      scheduleImportId: null,
      tolerance: { absoluteCents: 100, percent: 0.05 }
    });

    expect(result.status).toBe("WARN");
  });

  it("warns when pension schedule data is unavailable", () => {
    const result = evaluateRegisterPensionToScheduleTotal({
      registerTotal: { totalCents: 5000, rows: [] },
      scheduleTotal: { totalCents: 0, rows: [] },
      registerImportId: "reg-4",
      scheduleImportId: "sched-3",
      tolerance: { absoluteCents: 100, percent: 0.05 },
      missingReason: "Register pension columns are not mapped."
    });

    expect(result.status).toBe("WARN");
    expect(result.summary).toContain("Register pension columns are not mapped");
  });

  it("fails when pension schedule differs beyond tolerance", () => {
    const result = evaluateRegisterPensionToScheduleTotal({
      registerTotal: { totalCents: 5000, rows: [] },
      scheduleTotal: { totalCents: 4000, rows: [] },
      registerImportId: "reg-2",
      scheduleImportId: "sched-1",
      tolerance: { absoluteCents: 100, percent: 0.05 }
    });

    expect(result.status).toBe("FAIL");
    expect(result.exception?.category).toBe("SANITY");
  });

  it("passes when pension schedule matches within tolerance", () => {
    const result = evaluateRegisterPensionToScheduleTotal({
      registerTotal: { totalCents: 5000, rows: [] },
      scheduleTotal: { totalCents: 5050, rows: [] },
      registerImportId: "reg-3",
      scheduleImportId: "sched-2",
      tolerance: { absoluteCents: 100, percent: 0.05 }
    });

    expect(result.status).toBe("PASS");
  });

  it("flags duplicate and negative bank payments", () => {
    const duplicateResult = evaluateBankDuplicatePayments({
      duplicateRows: [
        { rowNumber: 2, amountCents: 1000 },
        { rowNumber: 3, amountCents: 1000 }
      ],
      bankImportId: "bank-dup"
    });
    const negativeResult = evaluateBankNegativePayments({
      negativeRows: [{ rowNumber: 4, amountCents: 200 }],
      bankImportId: "bank-neg"
    });

    expect(duplicateResult.status).toBe("FAIL");
    expect(duplicateResult.exception?.category).toBe("BANK_DATA_QUALITY");
    expect(negativeResult.status).toBe("FAIL");
  });

  it("warns when bank payment counts diverge", () => {
    const result = evaluateBankPaymentCountMismatch({
      registerCount: 100,
      bankCount: 80,
      tolerancePercent: 5
    });

    expect(result.status).toBe("WARN");
  });
});
