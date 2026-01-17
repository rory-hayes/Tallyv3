import type { SourceType } from "@tally/db";

export type ColumnMap = Record<string, string | null | undefined>;

export type MappingField = {
  key: string;
  label: string;
  kind: "string" | "number";
  required?: boolean;
  group?: string;
};

export type MappingFieldGroup = {
  id: string;
  label: string;
  fields: string[];
};

export type MappingFieldConfig = {
  fields: MappingField[];
  requiredFields: string[];
  requiredGroups?: MappingFieldGroup[];
};

export const mappingFieldConfigs: Record<SourceType, MappingFieldConfig> = {
  REGISTER: {
    fields: [
      { key: "employeeId", label: "Employee ID", kind: "string", group: "employee" },
      { key: "employeeName", label: "Employee name", kind: "string", group: "employee" },
      { key: "netPay", label: "Net pay", kind: "number", required: true },
      { key: "grossPay", label: "Gross pay", kind: "number" },
      { key: "tax1", label: "Tax (PAYE/USC)", kind: "number", required: true },
      { key: "tax2", label: "Tax 2 (NI/PRSI)", kind: "number" },
      { key: "tax3", label: "Tax 3 (Other)", kind: "number" },
      { key: "pensionEmployee", label: "Pension employee", kind: "number" },
      { key: "pensionEmployer", label: "Pension employer", kind: "number" },
      { key: "otherDeductions", label: "Other deductions", kind: "number" }
    ],
    requiredFields: ["netPay", "tax1"],
    requiredGroups: [
      {
        id: "employee",
        label: "Employee identifier",
        fields: ["employeeId", "employeeName"]
      }
    ]
  },
  BANK: {
    fields: [
      { key: "payeeId", label: "Payee ID", kind: "string", group: "payee" },
      { key: "payeeName", label: "Payee name", kind: "string", group: "payee" },
      { key: "amount", label: "Payment amount", kind: "number", required: true },
      { key: "reference", label: "Payment reference", kind: "string" }
    ],
    requiredFields: ["amount"],
    requiredGroups: [
      {
        id: "payee",
        label: "Payee identifier",
        fields: ["payeeId", "payeeName"]
      }
    ]
  },
  GL: {
    fields: [
      { key: "account", label: "Account code/name", kind: "string", required: true },
      { key: "description", label: "Description", kind: "string" },
      { key: "costCentre", label: "Cost centre/department", kind: "string" },
      { key: "signedAmount", label: "Signed amount", kind: "number" },
      { key: "debit", label: "Debit amount", kind: "number" },
      { key: "credit", label: "Credit amount", kind: "number" }
    ],
    requiredFields: ["account"]
  },
  STATUTORY: {
    fields: [
      { key: "category", label: "Category", kind: "string", required: true },
      { key: "amount", label: "Amount", kind: "number", required: true }
    ],
    requiredFields: ["category", "amount"]
  }
};

export const normalizeColumnName = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

export const detectColumnDrift = (
  expected: string[],
  actual: string[]
): { drifted: boolean; missing: string[]; added: string[] } => {
  const expectedMap = new Map<string, string>();
  const actualMap = new Map<string, string>();

  for (const column of expected) {
    const normalized = normalizeColumnName(column);
    if (normalized) {
      expectedMap.set(normalized, column);
    }
  }

  for (const column of actual) {
    const normalized = normalizeColumnName(column);
    if (normalized) {
      actualMap.set(normalized, column);
    }
  }

  const missing = Array.from(expectedMap.keys())
    .filter((key) => !actualMap.has(key))
    .map((key) => expectedMap.get(key) ?? key);
  const added = Array.from(actualMap.keys())
    .filter((key) => !expectedMap.has(key))
    .map((key) => actualMap.get(key) ?? key);

  return {
    drifted: missing.length > 0 || added.length > 0,
    missing,
    added
  };
};

export const validateColumnMap = (
  sourceType: SourceType,
  columnMap: ColumnMap,
  sourceColumns: string[]
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const config = mappingFieldConfigs[sourceType];
  const normalizedColumns = new Set(
    sourceColumns.map(normalizeColumnName).filter(Boolean)
  );

  if (normalizedColumns.size === 0) {
    return {
      valid: false,
      errors: ["No columns were detected for this file."]
    };
  }

  const hasMapping = (key: string) => {
    const value = columnMap[key];
    if (!value) {
      return false;
    }
    return normalizedColumns.has(normalizeColumnName(value));
  };

  for (const [key, value] of Object.entries(columnMap)) {
    if (!value) {
      continue;
    }
    if (!normalizedColumns.has(normalizeColumnName(value))) {
      errors.push(`Mapped column "${value}" for ${key} does not exist.`);
    }
  }

  for (const requiredField of config.requiredFields) {
    if (!hasMapping(requiredField)) {
      const label =
        config.fields.find((field) => field.key === requiredField)?.label ??
        requiredField;
      errors.push(`Missing required field: ${label}.`);
    }
  }

  for (const group of config.requiredGroups ?? []) {
    const groupMapped = group.fields.some((field) => hasMapping(field));
    if (!groupMapped) {
      errors.push(`Map at least one field for ${group.label}.`);
    }
  }

  if (sourceType === "GL") {
    const signedAmount = hasMapping("signedAmount");
    const debit = hasMapping("debit");
    const credit = hasMapping("credit");
    if (!signedAmount && !(debit && credit)) {
      errors.push("Map a signed amount or both debit and credit columns.");
    }
    if ((debit && !credit) || (!debit && credit)) {
      errors.push("Debit and credit must be mapped together.");
    }
  }

  return { valid: errors.length === 0, errors };
};

export const areColumnMapsEquivalent = (
  left: ColumnMap,
  right: ColumnMap
): boolean => {
  const leftEntries = Object.entries(left).filter(([, value]) => value);
  const rightEntries = Object.entries(right).filter(([, value]) => value);
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }
  const rightMap = new Map(
    rightEntries.map(([key, value]) => [key, normalizeColumnName(String(value))])
  );
  return leftEntries.every(([key, value]) => {
    const normalized = normalizeColumnName(String(value));
    return rightMap.get(key) === normalized;
  });
};
