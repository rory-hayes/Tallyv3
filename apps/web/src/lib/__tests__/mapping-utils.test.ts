import { describe, expect, it } from "vitest";
import {
  areColumnMapsEquivalent,
  detectColumnDrift,
  mappingFieldConfigs,
  validateColumnMap
} from "@/lib/mapping-utils";

describe("mapping validation", () => {
  it("requires employee identifier and tax for register", () => {
    const result = validateColumnMap(
      "REGISTER",
      {
        netPay: "Net",
        employeeName: "Employee"
      },
      ["Employee", "Net", "Tax"]
    );
    expect(result.valid).toBe(false);
  });

  it("accepts required register fields", () => {
    const result = validateColumnMap(
      "REGISTER",
      {
        netPay: "Net",
        tax1: "Tax",
        employeeName: "Employee"
      },
      ["Employee", "Net", "Tax"]
    );
    expect(result.valid).toBe(true);
  });

  it("requires payee and amount for bank", () => {
    const result = validateColumnMap(
      "BANK",
      {
        amount: "Amount"
      },
      ["Amount", "Payee"]
    );
    expect(result.valid).toBe(false);
  });

  it("accepts signed amount for GL", () => {
    const result = validateColumnMap(
      "GL",
      {
        account: "Account",
        signedAmount: "Amount"
      },
      ["Account", "Amount"]
    );
    expect(result.valid).toBe(true);
  });

  it("rejects partial debit/credit mapping for GL", () => {
    const result = validateColumnMap(
      "GL",
      {
        account: "Account",
        debit: "Debit"
      },
      ["Account", "Debit", "Credit"]
    );
    expect(result.valid).toBe(false);
  });

  it("rejects when no columns are detected", () => {
    const result = validateColumnMap("BANK", { amount: "Amount" }, []);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("No columns");
  });

  it("requires pension amounts for pension schedules", () => {
    const result = validateColumnMap(
      "PENSION_SCHEDULE",
      {
        employeeName: "Employee"
      },
      ["Employee", "Total"]
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("Pension amount"))).toBe(
      true
    );
  });

  it("accepts pension schedule totals", () => {
    const result = validateColumnMap(
      "PENSION_SCHEDULE",
      {
        amount: "Total"
      },
      ["Employee", "Total"]
    );
    expect(result.valid).toBe(true);
  });

  it("flags missing mapped columns", () => {
    const result = validateColumnMap(
      "STATUTORY",
      {
        category: "Category",
        amount: "Missing"
      },
      ["Category", "Amount"]
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("does not exist"))).toBe(
      true
    );
  });

  it("skips empty mapped values when validating", () => {
    const result = validateColumnMap(
      "STATUTORY",
      {
        category: "Category",
        amount: null
      },
      ["Category", "Amount"]
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("does not exist"))).toBe(
      false
    );
  });

  it("falls back to field keys when labels are missing", () => {
    const originalFields = mappingFieldConfigs.REGISTER.fields;
    const originalRequired = mappingFieldConfigs.REGISTER.requiredFields;

    mappingFieldConfigs.REGISTER.fields = originalFields.filter(
      (field) => field.key !== "tax1"
    );

    try {
      const result = validateColumnMap(
        "REGISTER",
        {
          netPay: "Net",
          employeeName: "Employee"
        },
        ["Employee", "Net", "Tax"]
      );
      expect(result.errors.some((error) => error.includes("tax1"))).toBe(true);
    } finally {
      mappingFieldConfigs.REGISTER.fields = originalFields;
      mappingFieldConfigs.REGISTER.requiredFields = originalRequired;
    }
  });
});

describe("template drift detection", () => {
  it("flags added and missing columns", () => {
    const drift = detectColumnDrift(["A", "B"], ["A", "C"]);
    expect(drift.drifted).toBe(true);
    expect(drift.missing).toEqual(["B"]);
    expect(drift.added).toEqual(["C"]);
  });

  it("compares column maps for equivalence", () => {
    expect(
      areColumnMapsEquivalent(
        { netPay: "Net" },
        { netPay: "net" }
      )
    ).toBe(true);
    expect(
      areColumnMapsEquivalent(
        { netPay: "Net" },
        { netPay: "Net", tax1: "Tax" }
      )
    ).toBe(false);
  });
});
