import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/clients";
import { createPayRun } from "@/lib/pay-runs";
import { applyMappingTemplate } from "@/lib/mapping-templates";
import { buildStorageKey, createImport } from "@/lib/imports";
import { sha256FromString } from "@/lib/hash";
import { ValidationError } from "@/lib/errors";
import { normalizeImport } from "@/lib/normalized-datasets";
import { storageClient } from "@/lib/storage";
import { createFirmWithUser, resetDb } from "./test-db";

describe("import status pipeline", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  const createParsedImport = async (
    context: Parameters<typeof createImport>[0],
    input: {
      payRunId: string;
      sourceType: "REGISTER" | "BANK" | "GL";
      originalFilename: string;
    }
  ) => {
    const storageKey = buildStorageKey(
      context.firmId,
      input.payRunId,
      input.sourceType,
      input.originalFilename
    );
    const result = await createImport(context, {
      payRunId: input.payRunId,
      sourceType: input.sourceType,
      storageKey,
      fileHashSha256: await sha256FromString(`${input.sourceType}-${input.originalFilename}`),
      originalFilename: input.originalFilename,
      mimeType: "text/csv",
      sizeBytes: 120
    });
    await prisma.import.update({
      where: { id: result.importRecord.id },
      data: { parseStatus: "PARSED" }
    });
    return { importRecord: result.importRecord, storageKey };
  };

  it("marks required imports as READY after all mappings", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Pipeline Client",
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

    const registerImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        originalFilename: "register.csv"
      }
    );
    const bankImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "BANK",
        originalFilename: "bank.csv"
      }
    );
    const glImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "GL",
        originalFilename: "gl.csv"
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
        },
        publish: true
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
        },
        publish: true
      }
    );

    await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        importId: glImport.importRecord.id,
        templateName: "GL Template",
        sourceColumns: ["Account", "Signed Amount"],
        columnMap: {
          account: "Account",
          signedAmount: "Signed Amount"
        },
        publish: true
      }
    );

    const contents = new Map<string, string>();
    contents.set(registerImport.storageKey, "Employee,Net,Tax\nA,100,10\n");
    contents.set(bankImport.storageKey, "Payee,Amount\nA,100\n");
    contents.set(glImport.storageKey, "Account,Signed Amount\nPayroll,100\n");
    mockStorage(contents);

    await normalizeImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      registerImport.importRecord.id
    );
    await normalizeImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      bankImport.importRecord.id
    );
    await normalizeImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      glImport.importRecord.id
    );

    const refreshed = await prisma.import.findMany({
      where: {
        id: {
          in: [
            registerImport.importRecord.id,
            bankImport.importRecord.id,
            glImport.importRecord.id
          ]
        }
      }
    });

    for (const entry of refreshed) {
      expect(entry.parseStatus).toBe("READY");
    }

    const updatedPayRun = await prisma.payRun.findFirst({
      where: { id: payRun.id }
    });
    expect(updatedPayRun?.status).toBe("MAPPED");
  });

  it("blocks mapping before parsing", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Pipeline Client 2",
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

    const storageKey = buildStorageKey(
      firm.id,
      payRun.id,
      "REGISTER",
      "pending.csv"
    );
    const pendingImport = await createImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey,
        fileHashSha256: await sha256FromString("register-pending"),
        originalFilename: "pending.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await expect(
      applyMappingTemplate(
        { firmId: firm.id, userId: user.id, role: user.role },
        {
          importId: pendingImport.importRecord.id,
          templateName: "Register Template",
          sourceColumns: ["Employee", "Net", "Tax"],
          columnMap: {
            employeeName: "Employee",
            netPay: "Net",
            tax1: "Tax"
          },
          publish: true
        }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
