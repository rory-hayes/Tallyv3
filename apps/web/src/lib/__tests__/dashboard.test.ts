import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/clients";
import { createPayRun } from "@/lib/pay-runs";
import { buildStorageKey, createImport } from "@/lib/imports";
import { sha256FromString } from "@/lib/hash";
import { getDashboardData } from "@/lib/dashboard";
import { createFirmWithUser, resetDb } from "./test-db";

const createParsedImport = async (
  context: Parameters<typeof createImport>[0],
  input: Parameters<typeof createImport>[1]
) => {
  const result = await createImport(context, input);
  await prisma.import.update({
    where: { id: result.importRecord.id },
    data: { parseStatus: "PARSED" }
  });
  return result.importRecord;
};

describe("dashboard data", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns firm-scoped counts and next steps", async () => {
    const { firm: firmA, user: userA } = await createFirmWithUser("ADMIN");
    const { firm: firmB, user: userB } = await createFirmWithUser("ADMIN");

    await prisma.firm.update({
      where: { id: firmA.id },
      data: {
        defaults: {
          requiredSources: {
            register: true,
            bank: true,
            gl: true
          }
        }
      }
    });

    const clientA = await createClient(
      { firmId: firmA.id, userId: userA.id },
      {
        name: "Acme Payroll",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );

    const payRun1 = await createPayRun(
      { firmId: firmA.id, userId: userA.id, role: "ADMIN" },
      {
        clientId: clientA.id,
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-01-31")
      }
    );

    const payRun2 = await createPayRun(
      { firmId: firmA.id, userId: userA.id, role: "ADMIN" },
      {
        clientId: clientA.id,
        periodStart: new Date("2026-02-01"),
        periodEnd: new Date("2026-02-28")
      }
    );

    const registerTemplate = await prisma.mappingTemplate.create({
      data: {
        firmId: firmA.id,
        clientId: clientA.id,
        sourceType: "REGISTER",
        version: 1,
        name: "Register Template",
        status: "ACTIVE",
        sourceColumns: ["Employee"],
        columnMap: { employeeName: "Employee" },
        createdByUserId: userA.id
      }
    });

    const bankTemplate = await prisma.mappingTemplate.create({
      data: {
        firmId: firmA.id,
        clientId: clientA.id,
        sourceType: "BANK",
        version: 1,
        name: "Bank Template",
        status: "ACTIVE",
        sourceColumns: ["Payee"],
        columnMap: { payeeName: "Payee" },
        createdByUserId: userA.id
      }
    });

    const glTemplate = await prisma.mappingTemplate.create({
      data: {
        firmId: firmA.id,
        clientId: clientA.id,
        sourceType: "GL",
        version: 1,
        name: "GL Template",
        status: "ACTIVE",
        sourceColumns: ["Account"],
        columnMap: { accountCode: "Account" },
        createdByUserId: userA.id
      }
    });

    const registerImport = await createParsedImport(
      { firmId: firmA.id, userId: userA.id, role: "ADMIN" },
      {
        payRunId: payRun1.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(
          firmA.id,
          payRun1.id,
          "REGISTER",
          "register.csv"
        ),
        fileHashSha256: await sha256FromString("register-v1"),
        originalFilename: "register.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await prisma.import.update({
      where: { id: registerImport.id },
      data: { mappingTemplateVersionId: registerTemplate.id }
    });

    await createParsedImport(
      { firmId: firmA.id, userId: userA.id, role: "ADMIN" },
      {
        payRunId: payRun1.id,
        sourceType: "BANK",
        storageKey: buildStorageKey(
          firmA.id,
          payRun1.id,
          "BANK",
          "bank.csv"
        ),
        fileHashSha256: await sha256FromString("bank-v1"),
        originalFilename: "bank.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    const payRun2RegisterImport = await createParsedImport(
      { firmId: firmA.id, userId: userA.id, role: "ADMIN" },
      {
        payRunId: payRun2.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(
          firmA.id,
          payRun2.id,
          "REGISTER",
          "register-v2.csv"
        ),
        fileHashSha256: await sha256FromString("register-v2"),
        originalFilename: "register-v2.csv",
        mimeType: "text/csv",
        sizeBytes: 140
      }
    );

    await prisma.import.update({
      where: { id: payRun2RegisterImport.id },
      data: { mappingTemplateVersionId: registerTemplate.id }
    });

    const payRun2BankImport = await createParsedImport(
      { firmId: firmA.id, userId: userA.id, role: "ADMIN" },
      {
        payRunId: payRun2.id,
        sourceType: "BANK",
        storageKey: buildStorageKey(
          firmA.id,
          payRun2.id,
          "BANK",
          "bank-v2.csv"
        ),
        fileHashSha256: await sha256FromString("bank-v2"),
        originalFilename: "bank-v2.csv",
        mimeType: "text/csv",
        sizeBytes: 140
      }
    );

    await prisma.import.update({
      where: { id: payRun2BankImport.id },
      data: { mappingTemplateVersionId: bankTemplate.id }
    });

    const payRun2GlImport = await createParsedImport(
      { firmId: firmA.id, userId: userA.id, role: "ADMIN" },
      {
        payRunId: payRun2.id,
        sourceType: "GL",
        storageKey: buildStorageKey(firmA.id, payRun2.id, "GL", "gl-v2.csv"),
        fileHashSha256: await sha256FromString("gl-v2"),
        originalFilename: "gl-v2.csv",
        mimeType: "text/csv",
        sizeBytes: 140
      }
    );

    await prisma.import.update({
      where: { id: payRun2GlImport.id },
      data: { mappingTemplateVersionId: glTemplate.id }
    });

    await prisma.payRun.update({
      where: { id: payRun2.id },
      data: { status: "READY_FOR_REVIEW" }
    });

    const clientB = await createClient(
      { firmId: firmB.id, userId: userB.id },
      {
        name: "Other Firm",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );

    const payRunB = await createPayRun(
      { firmId: firmB.id, userId: userB.id, role: "ADMIN" },
      {
        clientId: clientB.id,
        periodStart: new Date("2026-03-01"),
        periodEnd: new Date("2026-03-31")
      }
    );

    await prisma.payRun.update({
      where: { id: payRunB.id },
      data: { status: "LOCKED" }
    });

    const firmBEvent = await prisma.auditEvent.create({
      data: {
        firmId: firmB.id,
        actorUserId: userB.id,
        action: "PAY_RUN_CREATED",
        entityType: "PAY_RUN",
        entityId: payRunB.id,
        timestamp: new Date("2030-01-01T00:00:00Z")
      }
    });

    for (let index = 0; index < 12; index += 1) {
      await prisma.auditEvent.create({
        data: {
          firmId: firmA.id,
          actorUserId: userA.id,
          action: "PAY_RUN_CREATED",
          entityType: "PAY_RUN",
          entityId: payRun1.id,
          timestamp: new Date(`2026-01-01T00:00:${String(index).padStart(2, "0")}Z`)
        }
      });
    }

    const data = await getDashboardData(firmA.id);

    expect(data.countsByStatus.IMPORTED ?? 0).toBe(1);
    expect(data.countsByStatus.READY_FOR_REVIEW ?? 0).toBe(1);
    expect(data.countsByStatus.LOCKED ?? 0).toBe(0);
    expect(data.missingSourcesCount).toBe(1);
    expect(data.mappingRequiredCount).toBe(1);
    expect(data.approvalsPending).toBe(1);
    expect(data.recentAuditEvents).toHaveLength(10);
    expect(
      data.recentAuditEvents.find((event) => event.id === firmBEvent.id)
    ).toBeUndefined();
  });

  it("falls back to default sources when firm defaults are missing or invalid", async () => {
    const { firm } = await createFirmWithUser("ADMIN");

    const initial = await getDashboardData(firm.id);
    expect(initial.requiredSources).toEqual(["REGISTER", "BANK", "GL"]);
    expect(initial.missingSourcesCount).toBe(0);
    expect(initial.mappingRequiredCount).toBe(0);
    expect(initial.approvalsPending).toBe(0);
    expect(initial.recentAuditEvents).toHaveLength(0);

    await prisma.firm.update({
      where: { id: firm.id },
      data: { defaults: { requiredSources: "bad" } }
    });

    const invalidDefaults = await getDashboardData(firm.id);
    expect(invalidDefaults.requiredSources).toEqual(["REGISTER", "BANK", "GL"]);

    await prisma.firm.update({
      where: { id: firm.id },
      data: { defaults: { requiredSources: { statutory: true } } }
    });

    const statutoryOnly = await getDashboardData(firm.id);
    expect(statutoryOnly.requiredSources).toEqual(["STATUTORY"]);

    await prisma.firm.update({
      where: { id: firm.id },
      data: { defaults: { requiredSources: {} } }
    });

    const emptyRequired = await getDashboardData(firm.id);
    expect(emptyRequired.requiredSources).toEqual(["REGISTER", "BANK", "GL"]);
  });
});
