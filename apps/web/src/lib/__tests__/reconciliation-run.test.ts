import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/clients";
import { createPayRun } from "@/lib/pay-runs";
import { applyMappingTemplate } from "@/lib/mapping-templates";
import { buildStorageKey, createImport } from "@/lib/imports";
import { sha256FromString } from "@/lib/hash";
import { runReconciliation } from "@/lib/reconciliation";
import { storageClient } from "@/lib/storage";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createFirmWithUser, resetDb } from "./test-db";

type StorageCommand = {
  input?: {
    Key?: string;
  };
};

const mockStorage = (contents: Map<string, string>) => {
  vi.spyOn(
    storageClient as unknown as { send: (command: StorageCommand) => Promise<unknown> },
    "send"
  ).mockImplementation(async (command: StorageCommand) => {
    const key = command.input?.Key ?? "";
    if (!contents.has(key)) {
      throw new Error(`Unexpected storage key: ${key}`);
    }
    const body = contents.get(key) ?? "";
    return { Body: Buffer.from(body) } as { Body: unknown };
  });
};

describe("reconciliation run", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createParsedImport = async (
    context: Parameters<typeof createImport>[0],
    input: Parameters<typeof createImport>[1]
  ) => {
    const result = await createImport(context, input);
    await prisma.import.update({
      where: { id: result.importRecord.id },
      data: { parseStatus: "PARSED" }
    });
    return result;
  };

  const setupPayRun = async ({
    region = "UK",
    glMode = "signed"
  }: {
    region?: "UK" | "IE";
    glMode?: "signed" | "debitCredit";
  } = {}) => {
    const { firm, user } = await createFirmWithUser("ADMIN", region);
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Reconciliation Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-03-01T00:00:00Z"),
        periodEnd: new Date("2026-03-31T00:00:00Z")
      }
    );

    const registerStorageKey = buildStorageKey(
      firm.id,
      payRun.id,
      "REGISTER",
      "register.csv"
    );
    const bankStorageKey = buildStorageKey(
      firm.id,
      payRun.id,
      "BANK",
      "bank.csv"
    );
    const glStorageKey = buildStorageKey(
      firm.id,
      payRun.id,
      "GL",
      "gl.csv"
    );

    const registerImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: registerStorageKey,
        fileHashSha256: await sha256FromString("register"),
        originalFilename: "register.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );
    const bankImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "BANK",
        storageKey: bankStorageKey,
        fileHashSha256: await sha256FromString("bank"),
        originalFilename: "bank.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );
    const glImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "GL",
        storageKey: glStorageKey,
        fileHashSha256: await sha256FromString("gl"),
        originalFilename: "gl.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        importId: registerImport.importRecord.id,
        templateName: "Register Template",
        sourceColumns: ["Employee", "Net", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax"
        }
      }
    );
    await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        importId: bankImport.importRecord.id,
        templateName: "Bank Template",
        sourceColumns: ["Payee", "Amount"],
        columnMap: {
          payeeName: "Payee",
          amount: "Amount"
        }
      }
    );
    if (glMode === "debitCredit") {
      await applyMappingTemplate(
        { firmId: firm.id, userId: user.id, role: user.role },
        {
          importId: glImport.importRecord.id,
          templateName: "GL Template",
          sourceColumns: ["Account", "Debit", "Credit"],
          columnMap: {
            account: "Account",
            debit: "Debit",
            credit: "Credit"
          }
        }
      );
    } else {
      await applyMappingTemplate(
        { firmId: firm.id, userId: user.id, role: user.role },
        {
          importId: glImport.importRecord.id,
          templateName: "GL Template",
          sourceColumns: ["Account", "Signed"],
          columnMap: {
            account: "Account",
            signedAmount: "Signed"
          }
        }
      );
    }

    return {
      firm,
      user,
      payRun,
      storageKeys: {
        register: registerStorageKey,
        bank: bankStorageKey,
        gl: glStorageKey
      },
      imports: {
        register: registerImport.importRecord,
        bank: bankImport.importRecord,
        gl: glImport.importRecord
      }
    };
  };

  it("creates reconciliation runs and check results", async () => {
    const { firm, user, payRun, storageKeys } = await setupPayRun();

    const contents = new Map<string, string>();
    contents.set(
      storageKeys.register,
      "Employee,Net,Tax\nA,100,10\nB,200,20\nC,,0\nD,abc,0\nE,-,0\n,,\n"
    );
    contents.set(storageKeys.bank, "Payee,Amount\nA,100\nB,200\n");
    contents.set(
      storageKeys.gl,
      "Account,Signed\nPayroll,300\nClearing,(300)\nZero,0\n"
    );
    mockStorage(contents);

    const result = await runReconciliation(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    expect(result.runNumber).toBe(1);
    const run = await prisma.reconciliationRun.findFirst({
      where: { payRunId: payRun.id }
    });
    expect(run?.status).toBe("SUCCESS");

    const checkCount = await prisma.checkResult.count({
      where: { reconciliationRunId: run?.id }
    });
    expect(checkCount).toBe(12);

    const exceptionCount = await prisma.exception.count({
      where: { reconciliationRunId: run?.id }
    });
    expect(exceptionCount).toBe(0);

    const updatedPayRun = await prisma.payRun.findFirst({
      where: { id: payRun.id }
    });
    expect(updatedPayRun?.status).toBe("RECONCILED");

    const auditEvents = await prisma.auditEvent.findMany({
      where: { firmId: firm.id, entityId: payRun.id }
    });
    const actions = auditEvents.map((event) => event.action);
    expect(actions).toContain("RECONCILIATION_STARTED");
    expect(actions).toContain("RECONCILIATION_COMPLETED");
  });

  it("supersedes previous runs and exceptions", async () => {
    const { firm, user, payRun, storageKeys } = await setupPayRun();

    const contents = new Map<string, string>();
    contents.set(
      storageKeys.register,
      "Employee,Net,Tax\nA,100,10\nB,200,20\nC,,0\n"
    );
    contents.set(storageKeys.bank, "Payee,Amount\nA,100\nB,150\n");
    contents.set(
      storageKeys.gl,
      "Account,Signed\nPayroll,300\nClearing,(300)\nZero,0\n"
    );
    mockStorage(contents);

    await runReconciliation(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    contents.set(storageKeys.bank, "Payee,Amount\nA,100\nB,200\n");

    const secondRun = await runReconciliation(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    expect(secondRun.runNumber).toBe(2);

    const runs = await prisma.reconciliationRun.findMany({
      where: { payRunId: payRun.id },
      orderBy: { runNumber: "asc" }
    });
    expect(runs).toHaveLength(2);
    expect(runs[0]?.supersededByRunId).toBe(runs[1]?.id);

    const exceptions = await prisma.exception.findMany({
      where: { payRunId: payRun.id },
      orderBy: { createdAt: "asc" }
    });
    expect(exceptions.length).toBeGreaterThan(0);
    for (const exception of exceptions) {
      if (exception.reconciliationRunId === runs[0]?.id) {
        expect(exception.supersededByRunId).toBe(runs[1]?.id);
      }
    }
  });

  it("supports debit and credit journal columns", async () => {
    const { firm, user, payRun, storageKeys } = await setupPayRun({
      glMode: "debitCredit"
    });

    const contents = new Map<string, string>();
    contents.set(storageKeys.register, "Employee,Net,Tax\nA,100,10\nB,200,20\n");
    contents.set(storageKeys.bank, "Payee,Amount\nA,100\nB,200\n");
    contents.set(
      storageKeys.gl,
      "Account,Debit,Credit\nPayroll,300,0\nClearing,0,300\nZero,0,0\n"
    );
    mockStorage(contents);

    const result = await runReconciliation(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    expect(result.runNumber).toBe(1);
    const exceptions = await prisma.exception.count({
      where: { payRunId: payRun.id }
    });
    expect(exceptions).toBe(0);
  });

  it("creates statutory mismatch exceptions when totals differ", async () => {
    const { firm, user, payRun, storageKeys } = await setupPayRun();

    const statutoryStorageKey = buildStorageKey(
      firm.id,
      payRun.id,
      "STATUTORY",
      "statutory.csv"
    );
    const statutoryImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "STATUTORY",
        storageKey: statutoryStorageKey,
        fileHashSha256: await sha256FromString("statutory"),
        originalFilename: "statutory.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        importId: statutoryImport.importRecord.id,
        templateName: "Statutory Template",
        sourceColumns: ["Category", "Amount"],
        columnMap: {
          category: "Category",
          amount: "Amount"
        },
        normalizationRules: {
          categoryMap: {
            paye: "TAX_PRIMARY"
          }
        }
      }
    );

    const contents = new Map<string, string>();
    contents.set(storageKeys.register, "Employee,Net,Tax\nA,100,10\nB,200,20\n");
    contents.set(storageKeys.bank, "Payee,Amount\nA,100\nB,200\n");
    contents.set(storageKeys.gl, "Account,Signed\nPayroll,300\nClearing,(300)\n");
    contents.set(statutoryStorageKey, "Category,Amount\nPAYE,5\n");
    mockStorage(contents);

    await runReconciliation(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    const statutoryException = await prisma.exception.findFirst({
      where: {
        payRunId: payRun.id,
        category: "STATUTORY_MISMATCH"
      }
    });
    expect(statutoryException).not.toBeNull();
  });

  it("warns when the pension schedule import is missing", async () => {
    const { firm, user, payRun, storageKeys, imports } = await setupPayRun();

    await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        importId: imports.register.id,
        templateName: "Register Template",
        sourceColumns: [
          "Employee",
          "Net",
          "Tax",
          "Pension Employee",
          "Pension Employer"
        ],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax",
          pensionEmployee: "Pension Employee",
          pensionEmployer: "Pension Employer"
        }
      }
    );

    const contents = new Map<string, string>();
    contents.set(
      storageKeys.register,
      "Employee,Net,Tax,Pension Employee,Pension Employer\nA,100,10,5,5\nB,200,20,5,5\n"
    );
    contents.set(storageKeys.bank, "Payee,Amount\nA,100\nB,200\n");
    contents.set(storageKeys.gl, "Account,Signed\nPayroll,300\nClearing,(300)\n");
    mockStorage(contents);

    await runReconciliation(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    const run = await prisma.reconciliationRun.findFirst({
      where: { payRunId: payRun.id },
      orderBy: { runNumber: "desc" }
    });
    const checkResult = await prisma.checkResult.findFirst({
      where: {
        reconciliationRunId: run?.id,
        checkType: "CHK_REGISTER_PENSION_TO_PENSION_SCHEDULE"
      }
    });
    expect(checkResult?.status).toBe("WARN");
    expect(checkResult?.summary).toContain("Pension schedule import is missing");

    const exception = checkResult
      ? await prisma.exception.findFirst({
          where: { checkResultId: checkResult.id }
        })
      : null;
    expect(exception).toBeNull();
  });

  it("creates pension schedule mismatch exceptions when totals differ", async () => {
    const { firm, user, payRun, storageKeys, imports } = await setupPayRun();

    const scheduleStorageKey = buildStorageKey(
      firm.id,
      payRun.id,
      "PENSION_SCHEDULE",
      "pension.csv"
    );
    const scheduleImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "PENSION_SCHEDULE",
        storageKey: scheduleStorageKey,
        fileHashSha256: await sha256FromString("pension"),
        originalFilename: "pension.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        importId: imports.register.id,
        templateName: "Register Template",
        sourceColumns: [
          "Employee",
          "Net",
          "Tax",
          "Pension Employee",
          "Pension Employer"
        ],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax",
          pensionEmployee: "Pension Employee",
          pensionEmployer: "Pension Employer"
        }
      }
    );

    await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        importId: scheduleImport.importRecord.id,
        templateName: "Pension Schedule Template",
        sourceColumns: ["Employee", "Total"],
        columnMap: {
          employeeName: "Employee",
          amount: "Total"
        }
      }
    );

    const contents = new Map<string, string>();
    contents.set(
      storageKeys.register,
      "Employee,Net,Tax,Pension Employee,Pension Employer\nA,100,10,10,10\nB,200,20,10,10\n"
    );
    contents.set(storageKeys.bank, "Payee,Amount\nA,100\nB,200\n");
    contents.set(storageKeys.gl, "Account,Signed\nPayroll,300\nClearing,(300)\n");
    contents.set(scheduleStorageKey, "Employee,Total\nA,10\nB,10\n");
    mockStorage(contents);

    await runReconciliation(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    const run = await prisma.reconciliationRun.findFirst({
      where: { payRunId: payRun.id },
      orderBy: { runNumber: "desc" }
    });
    const checkResult = await prisma.checkResult.findFirst({
      where: {
        reconciliationRunId: run?.id,
        checkType: "CHK_REGISTER_PENSION_TO_PENSION_SCHEDULE"
      }
    });
    expect(checkResult?.status).toBe("FAIL");

    const exception = checkResult
      ? await prisma.exception.findFirst({
          where: { checkResultId: checkResult.id, category: "SANITY" }
        })
      : null;
    expect(exception).not.toBeNull();
  });

  it("creates journal mismatch exceptions for misallocated totals", async () => {
    const { firm, user, payRun, storageKeys, imports } = await setupPayRun();

    await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        importId: imports.register.id,
        templateName: "Register Template",
        sourceColumns: ["Employee", "Net", "Gross", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          grossPay: "Gross",
          tax1: "Tax"
        }
      }
    );

    await prisma.accountClassification.createMany({
      data: [
        {
          firmId: firm.id,
          clientId: payRun.clientId,
          accountCode: "Payroll Expense",
          classification: "EXPENSE"
        },
        {
          firmId: firm.id,
          clientId: payRun.clientId,
          accountCode: "Net Wages",
          classification: "NET_PAYABLE"
        },
        {
          firmId: firm.id,
          clientId: payRun.clientId,
          accountCode: "Tax Payable",
          classification: "TAX_PAYABLE"
        },
        {
          firmId: firm.id,
          clientId: payRun.clientId,
          accountCode: "Clearing",
          classification: "CASH"
        }
      ]
    });

    const contents = new Map<string, string>();
    contents.set(
      storageKeys.register,
      "Employee,Net,Gross,Tax\nA,150,200,50\nB,150,200,50\n"
    );
    contents.set(storageKeys.bank, "Payee,Amount\nA,150\nB,150\n");
    contents.set(
      storageKeys.gl,
      "Account,Signed\nPayroll Expense,350\nNet Wages,300\nTax Payable,100\nClearing,(750)\n"
    );
    mockStorage(contents);

    await runReconciliation(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    const checkResult = await prisma.checkResult.findFirst({
      where: {
        reconciliationRun: { payRunId: payRun.id },
        checkType: "CHK_REGISTER_GROSS_TO_JOURNAL_EXPENSE"
      }
    });
    expect(checkResult?.status).toBe("FAIL");
  });

  it("flags duplicate and negative bank payments in reconciliation", async () => {
    const { firm, user, payRun, storageKeys } = await setupPayRun();

    const contents = new Map<string, string>();
    contents.set(storageKeys.register, "Employee,Net,Tax\nA,150,0\n");
    contents.set(
      storageKeys.bank,
      "Payee,Amount\nA,100\nA,100\nB,-50\n"
    );
    contents.set(storageKeys.gl, "Account,Signed\nPayroll,150\nClearing,(150)\n");
    mockStorage(contents);

    await runReconciliation(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    const bankExceptions = await prisma.exception.findMany({
      where: {
        payRunId: payRun.id,
        category: "BANK_DATA_QUALITY"
      }
    });
    expect(bankExceptions.length).toBeGreaterThanOrEqual(2);
  });

  it("downgrades mismatches when expected variance applies", async () => {
    const { firm, user, payRun, storageKeys } = await setupPayRun();

    await prisma.expectedVariance.create({
      data: {
        firmId: firm.id,
        clientId: payRun.clientId,
        checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL",
        varianceType: "ROUNDING",
        condition: { amountBounds: { max: 5 } },
        effect: { downgradeTo: "WARN" },
        active: true,
        createdByUserId: user.id
      }
    });

    const contents = new Map<string, string>();
    contents.set(storageKeys.register, "Employee,Net,Tax\nA,50,0\nB,50,0\n");
    contents.set(storageKeys.bank, "Payee,Amount\nBatch,95\n");
    contents.set(storageKeys.gl, "Account,Signed\nPayroll,100\nClearing,(100)\n");
    mockStorage(contents);

    await runReconciliation(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    const checkResult = await prisma.checkResult.findFirst({
      where: {
        reconciliationRun: { payRunId: payRun.id },
        checkType: "CHK_REGISTER_NET_TO_BANK_TOTAL"
      }
    });

    expect(checkResult?.status).toBe("WARN");

    const exceptions = await prisma.exception.findMany({
      where: { payRunId: payRun.id }
    });
    expect(exceptions.length).toBe(0);
  });

  it("uses the IE bundle for Irish firms", async () => {
    const { firm, user, payRun, storageKeys } = await setupPayRun({
      region: "IE"
    });

    const contents = new Map<string, string>();
    contents.set(
      storageKeys.register,
      "Employee,Net,Tax\nA,100,10\nB,200,20\nC,,0\n"
    );
    contents.set(storageKeys.bank, "Payee,Amount\nA,100\nB,200\n");
    contents.set(
      storageKeys.gl,
      "Account,Signed\nPayroll,300\nClearing,(300)\nZero,0\n"
    );
    mockStorage(contents);

    await runReconciliation(
      { firmId: firm.id, userId: user.id, role: user.role },
      payRun.id
    );

    const run = await prisma.reconciliationRun.findFirst({
      where: { payRunId: payRun.id }
    });
    expect(run?.bundleId).toBe("BUNDLE_IE");
    expect(run?.bundleVersion).toBe("V1");
  });

  it("requires statutory imports when configured", async () => {
    const { firm, user, payRun, storageKeys } = await setupPayRun();

    await prisma.firm.update({
      where: { id: firm.id },
      data: {
        defaults: {
          requiredSources: {
            register: true,
            bank: true,
            gl: true,
            statutory: true
          }
        }
      }
    });

    const contents = new Map<string, string>();
    contents.set(storageKeys.register, "Employee,Net,Tax\nA,100,10\nB,200,20\n");
    contents.set(storageKeys.bank, "Payee,Amount\nA,100\nB,200\n");
    contents.set(storageKeys.gl, "Account,Signed\nPayroll,300\nClearing,(300)\n");
    mockStorage(contents);

    await expect(
      runReconciliation(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("blocks reconciliation on locked pay runs", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Locked Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-06-01T00:00:00Z"),
        periodEnd: new Date("2026-06-30T00:00:00Z")
      }
    );

    await prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "LOCKED" }
    });

    await expect(
      runReconciliation(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects reconciliation from draft pay runs", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Draft Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-07-01T00:00:00Z"),
        periodEnd: new Date("2026-07-31T00:00:00Z")
      }
    );

    await expect(
      runReconciliation(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("fails when mapped columns are missing from the file", async () => {
    const { firm, user, payRun, storageKeys } = await setupPayRun();

    const contents = new Map<string, string>();
    contents.set(
      storageKeys.register,
      "Employee,Net Pay,Tax\nA,100,10\nB,200,20\n"
    );
    contents.set(storageKeys.bank, "Payee,Amount\nA,100\nB,200\n");
    contents.set(
      storageKeys.gl,
      "Account,Signed\nPayroll,300\nClearing,(300)\n"
    );
    mockStorage(contents);

    await expect(
      runReconciliation(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires debit and credit when signed amounts are absent", async () => {
    const { firm, user, payRun, storageKeys } = await setupPayRun({
      glMode: "debitCredit"
    });

    const template = await prisma.mappingTemplate.findFirst({
      where: { firmId: firm.id, sourceType: "GL" },
      orderBy: { version: "desc" }
    });
    if (!template) {
      throw new Error("Expected a GL template.");
    }

    await prisma.mappingTemplate.update({
      where: { id: template.id },
      data: {
        columnMap: {
          account: "Account",
          debit: "Debit"
        }
      }
    });

    const contents = new Map<string, string>();
    contents.set(storageKeys.register, "Employee,Net,Tax\nA,100,10\nB,200,20\n");
    contents.set(storageKeys.bank, "Payee,Amount\nA,100\nB,200\n");
    contents.set(
      storageKeys.gl,
      "Account,Debit,Credit\nPayroll,300,0\nClearing,0,300\n"
    );
    mockStorage(contents);

    await expect(
      runReconciliation(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires mapped columns in the template", async () => {
    const { firm, user, payRun, storageKeys } = await setupPayRun();

    const registerTemplate = await prisma.mappingTemplate.findFirst({
      where: { firmId: firm.id, sourceType: "REGISTER" },
      orderBy: { version: "desc" }
    });
    if (!registerTemplate) {
      throw new Error("Expected a register template.");
    }

    await prisma.mappingTemplate.update({
      where: { id: registerTemplate.id },
      data: {
        columnMap: {
          employeeName: "Employee",
          tax1: "Tax"
        }
      }
    });

    const contents = new Map<string, string>();
    contents.set(storageKeys.register, "Employee,Net,Tax\nA,100,10\nB,200,20\n");
    contents.set(storageKeys.bank, "Payee,Amount\nA,100\nB,200\n");
    contents.set(
      storageKeys.gl,
      "Account,Signed\nPayroll,300\nClearing,(300)\n"
    );
    mockStorage(contents);

    await expect(
      runReconciliation(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("fails when the import file is empty", async () => {
    const { firm, user, payRun, storageKeys } = await setupPayRun();

    const contents = new Map<string, string>();
    contents.set(storageKeys.register, "");
    contents.set(storageKeys.bank, "Payee,Amount\nA,100\nB,200\n");
    contents.set(
      storageKeys.gl,
      "Account,Signed\nPayroll,300\nClearing,(300)\n"
    );
    mockStorage(contents);

    await expect(
      runReconciliation(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("fails when the header row contains no columns", async () => {
    const { firm, user, payRun, storageKeys } = await setupPayRun();

    const contents = new Map<string, string>();
    contents.set(storageKeys.register, ",,\n1,2,3\n");
    contents.set(storageKeys.bank, "Payee,Amount\nA,100\nB,200\n");
    contents.set(
      storageKeys.gl,
      "Account,Signed\nPayroll,300\nClearing,(300)\n"
    );
    mockStorage(contents);

    await expect(
      runReconciliation(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("enforces firm scoping", async () => {
    const { payRun, storageKeys } = await setupPayRun();
    const other = await createFirmWithUser("ADMIN");

    const contents = new Map<string, string>();
    contents.set(storageKeys.register, "Employee,Net,Tax\nA,100,10\nB,200,20\n");
    contents.set(storageKeys.bank, "Payee,Amount\nA,100\nB,200\n");
    contents.set(storageKeys.gl, "Account,Signed\nPayroll,300\nClearing,(300)\n");
    mockStorage(contents);

    await expect(
      runReconciliation(
        { firmId: other.firm.id, userId: other.user.id, role: other.user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("requires all mapped imports before running", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Missing Import Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-04-01T00:00:00Z"),
        periodEnd: new Date("2026-04-30T00:00:00Z")
      }
    );

    const registerStorageKey = buildStorageKey(
      firm.id,
      payRun.id,
      "REGISTER",
      "register.csv"
    );
    const registerImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: registerStorageKey,
        fileHashSha256: await sha256FromString("register-missing"),
        originalFilename: "register.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        importId: registerImport.importRecord.id,
        templateName: "Register Template",
        sourceColumns: ["Employee", "Net", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax"
        }
      }
    );

    await expect(
      runReconciliation(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires mappings for all required imports", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Missing Mapping Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-05-01T00:00:00Z"),
        periodEnd: new Date("2026-05-31T00:00:00Z")
      }
    );

    const registerStorageKey = buildStorageKey(
      firm.id,
      payRun.id,
      "REGISTER",
      "register.csv"
    );
    const bankStorageKey = buildStorageKey(
      firm.id,
      payRun.id,
      "BANK",
      "bank.csv"
    );
    const glStorageKey = buildStorageKey(
      firm.id,
      payRun.id,
      "GL",
      "gl.csv"
    );

    const registerImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: registerStorageKey,
        fileHashSha256: await sha256FromString("register-map"),
        originalFilename: "register.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );
    await createParsedImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "BANK",
        storageKey: bankStorageKey,
        fileHashSha256: await sha256FromString("bank-map"),
        originalFilename: "bank.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );
    const glImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "GL",
        storageKey: glStorageKey,
        fileHashSha256: await sha256FromString("gl-map"),
        originalFilename: "gl.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        importId: registerImport.importRecord.id,
        templateName: "Register Template",
        sourceColumns: ["Employee", "Net", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax"
        }
      }
    );
    await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        importId: glImport.importRecord.id,
        templateName: "GL Template",
        sourceColumns: ["Account", "Signed"],
        columnMap: {
          account: "Account",
          signedAmount: "Signed"
        }
      }
    );

    await expect(
      runReconciliation(
        { firmId: firm.id, userId: user.id, role: user.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
