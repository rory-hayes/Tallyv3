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

    const registerImport = await createImport(
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
    const bankImport = await createImport(
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
    const glImport = await createImport(
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
    expect(checkCount).toBe(2);

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
    const registerImport = await createImport(
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

    const registerImport = await createImport(
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
    await createImport(
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
    const glImport = await createImport(
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
