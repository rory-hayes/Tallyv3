import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/clients";
import { createPayRun } from "@/lib/pay-runs";
import { buildStorageKey, createImport } from "@/lib/imports";
import { sha256FromString } from "@/lib/hash";
import { normalizeImport, NORMALIZATION_VERSION } from "@/lib/normalized-datasets";
import { storageClient } from "@/lib/storage";
import { ValidationError } from "@/lib/errors";
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

describe("normalized datasets", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setupMappedImport = async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Normalization Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-02-01T00:00:00Z"),
        periodEnd: new Date("2026-02-28T00:00:00Z")
      }
    );

    const storageKey = buildStorageKey(firm.id, payRun.id, "REGISTER", "register.csv");
    const result = await createImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey,
        fileHashSha256: await sha256FromString("register-normalize"),
        originalFilename: "register.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    const template = await prisma.mappingTemplate.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        sourceType: "REGISTER",
        version: 1,
        name: "Register Template",
        status: "ACTIVE",
        sourceColumns: ["Employee", "Net", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax"
        },
        createdByUserId: user.id
      }
    });

    await prisma.import.update({
      where: { id: result.importRecord.id },
      data: {
        parseStatus: "MAPPED",
        mappingTemplateVersionId: template.id
      }
    });

    return {
      firm,
      user,
      importId: result.importRecord.id,
      storageKey,
      templateId: template.id
    };
  };

  it("persists normalized datasets and marks imports READY", async () => {
    const { firm, user, importId, storageKey, templateId } = await setupMappedImport();

    const contents = new Map<string, string>();
    contents.set(storageKey, "Employee,Net,Tax\nA,100,10\nB,200,20\n");
    mockStorage(contents);

    const dataset = await normalizeImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      importId
    );

    expect(dataset.mappingTemplateVersionId).toBe(templateId);
    expect(dataset.normalizationVersion).toBe(NORMALIZATION_VERSION);
    expect(Array.isArray(dataset.rows)).toBe(true);
    expect((dataset.rows as Array<{ rowNumber: number }>).length).toBe(2);

    const updated = await prisma.import.findFirst({ where: { id: importId } });
    expect(updated?.parseStatus).toBe("READY");
    const summary = updated?.parseSummary as { normalizationVersion?: string; normalizedRowCount?: number };
    expect(summary.normalizationVersion).toBe(NORMALIZATION_VERSION);
    expect(summary.normalizedRowCount).toBe(2);
  });

  it("fails when the header row is missing", async () => {
    const { firm, user, importId, storageKey } = await setupMappedImport();

    const contents = new Map<string, string>();
    contents.set(storageKey, ",,\n1,2,3\n");
    mockStorage(contents);

    await expect(
      normalizeImport({ firmId: firm.id, userId: user.id, role: user.role }, importId)
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
