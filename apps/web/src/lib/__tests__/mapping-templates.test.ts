import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/clients";
import { createPayRun } from "@/lib/pay-runs";
import { applyMappingTemplate, updateTemplateStatus } from "@/lib/mapping-templates";
import { buildStorageKey, createImport } from "@/lib/imports";
import { sha256FromString } from "@/lib/hash";
import { createFirmWithUser, resetDb } from "./test-db";
import { NotFoundError, ValidationError } from "@/lib/errors";

describe("mapping template versioning", () => {
  beforeEach(async () => {
    await resetDb();
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

  it("creates a new template and versions on change", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Acme Payroll",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: client.id,
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-01-31")
      }
    );

    const firstHash = await sha256FromString("register-v1");
    const firstImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(
          firm.id,
          payRun.id,
          "REGISTER",
          "register.csv"
        ),
        fileHashSha256: firstHash,
        originalFilename: "register.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    const created = await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        importId: firstImport.importRecord.id,
        templateName: "Register Template",
        sourceColumns: ["Employee", "Net", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax"
        }
      }
    );

    expect(created.version).toBe(1);

    const secondHash = await sha256FromString("register-v2");
    const secondImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(
          firm.id,
          payRun.id,
          "REGISTER",
          "register-v2.csv"
        ),
        fileHashSha256: secondHash,
        originalFilename: "register-v2.csv",
        mimeType: "text/csv",
        sizeBytes: 140
      }
    );

    const versioned = await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        importId: secondImport.importRecord.id,
        templateId: created.templateId,
        sourceColumns: ["Employee", "Net", "Tax", "Gross"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax",
          grossPay: "Gross"
        },
        createNewVersion: true
      }
    );

    expect(versioned.version).toBe(2);

    const templateCount = await prisma.mappingTemplate.count({
      where: { firmId: firm.id }
    });
    expect(templateCount).toBe(2);
  });

  it("reuses an existing template when columns match", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Reuse Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: client.id,
        periodStart: new Date("2026-09-01"),
        periodEnd: new Date("2026-09-30")
      }
    );

    const importHash = await sha256FromString("register-base");
    const importRecord = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "base.csv"),
        fileHashSha256: importHash,
        originalFilename: "base.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    const created = await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        importId: importRecord.importRecord.id,
        templateName: "Register Base",
        sourceColumns: ["Employee", "Net", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax"
        }
      }
    );

    const secondHash = await sha256FromString("register-base-2");
    const secondImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "base-2.csv"),
        fileHashSha256: secondHash,
        originalFilename: "base-2.csv",
        mimeType: "text/csv",
        sizeBytes: 130
      }
    );

    const applied = await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        importId: secondImport.importRecord.id,
        templateId: created.templateId,
        sourceColumns: ["Employee", "Net", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax"
        }
      }
    );

    expect(applied.appliedExisting).toBe(true);
    const templates = await prisma.mappingTemplate.findMany({
      where: { firmId: firm.id }
    });
    expect(templates).toHaveLength(1);
  });

  it("transitions pay runs to mapped when required sources are mapped", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Mapped Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: client.id,
        periodStart: new Date("2026-11-01"),
        periodEnd: new Date("2026-11-30")
      }
    );

    const registerHash = await sha256FromString("register");
    const bankHash = await sha256FromString("bank");
    const glHash = await sha256FromString("gl");

    const registerImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "r.csv"),
        fileHashSha256: registerHash,
        originalFilename: "r.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );
    const bankImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "BANK",
        storageKey: buildStorageKey(firm.id, payRun.id, "BANK", "b.csv"),
        fileHashSha256: bankHash,
        originalFilename: "b.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );
    const glImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "GL",
        storageKey: buildStorageKey(firm.id, payRun.id, "GL", "g.csv"),
        fileHashSha256: glHash,
        originalFilename: "g.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
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
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
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

    await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        importId: glImport.importRecord.id,
        templateName: "GL Template",
        sourceColumns: ["Account", "Amount"],
        columnMap: {
          account: "Account",
          signedAmount: "Amount"
        }
      }
    );

    const updated = await prisma.payRun.findFirst({
      where: { id: payRun.id }
    });
    expect(updated?.status).toBe("MAPPED");
  });

  it("does not auto-transition for reviewers", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const reviewer = await prisma.user.create({
      data: {
        firmId: firm.id,
        email: "reviewer2@example.com",
        role: "REVIEWER",
        status: "ACTIVE"
      }
    });
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Reviewer Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: client.id,
        periodStart: new Date("2026-12-01"),
        periodEnd: new Date("2026-12-31")
      }
    );
    const importHash = await sha256FromString("register-reviewer");
    const importRecord = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "r.csv"),
        fileHashSha256: importHash,
        originalFilename: "r.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await applyMappingTemplate(
      { firmId: firm.id, userId: reviewer.id, role: reviewer.role },
      {
        importId: importRecord.importRecord.id,
        templateName: "Register Template",
        sourceColumns: ["Employee", "Net", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax"
        }
      }
    );

    const updated = await prisma.payRun.findFirst({
      where: { id: payRun.id }
    });
    expect(updated?.status).toBe("IMPORTED");
  });

  it("requires new version on drift", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Drift Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: client.id,
        periodStart: new Date("2027-01-01"),
        periodEnd: new Date("2027-01-31")
      }
    );

    const firstHash = await sha256FromString("register-drift-1");
    const firstImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "a.csv"),
        fileHashSha256: firstHash,
        originalFilename: "a.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    const template = await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        importId: firstImport.importRecord.id,
        templateName: "Drift Template",
        sourceColumns: ["Employee", "Net", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax"
        }
      }
    );

    const secondHash = await sha256FromString("register-drift-2");
    const secondImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "b.csv"),
        fileHashSha256: secondHash,
        originalFilename: "b.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await expect(
      applyMappingTemplate(
        { firmId: firm.id, userId: user.id, role: "ADMIN" },
        {
          importId: secondImport.importRecord.id,
          templateId: template.templateId,
          sourceColumns: ["Employee", "Net", "Tax", "Gross"],
          columnMap: {
            employeeName: "Employee",
            netPay: "Net",
            tax1: "Tax",
            grossPay: "Gross"
          }
        }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("creates draft templates when publish is false", async () => {
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
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: client.id,
        periodStart: new Date("2027-02-01"),
        periodEnd: new Date("2027-02-28")
      }
    );
    const importHash = await sha256FromString("register-draft");
    const importRecord = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "draft.csv"),
        fileHashSha256: importHash,
        originalFilename: "draft.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    const result = await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        importId: importRecord.importRecord.id,
        templateName: "Draft Template",
        sourceColumns: ["Employee", "Net", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax"
        },
        publish: false
      }
    );

    const template = await prisma.mappingTemplate.findFirst({
      where: { id: result.templateId }
    });
    expect(template?.status).toBe("DRAFT");
  });

  it("requires a template name when creating new", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Name Required",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: client.id,
        periodStart: new Date("2026-10-01"),
        periodEnd: new Date("2026-10-31")
      }
    );
    const importHash = await sha256FromString("register-name");
    const importRecord = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "name.csv"),
        fileHashSha256: importHash,
        originalFilename: "name.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await expect(
      applyMappingTemplate(
        { firmId: firm.id, userId: user.id, role: "ADMIN" },
        {
          importId: importRecord.importRecord.id,
          sourceColumns: ["Employee", "Net", "Tax"],
          columnMap: {
            employeeName: "Employee",
            netPay: "Net",
            tax1: "Tax"
          }
        }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects invalid mappings before saving templates", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Invalid Map Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: client.id,
        periodStart: new Date("2027-03-01"),
        periodEnd: new Date("2027-03-31")
      }
    );
    const importHash = await sha256FromString("register-invalid");
    const importRecord = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "bad.csv"),
        fileHashSha256: importHash,
        originalFilename: "bad.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await expect(
      applyMappingTemplate(
        { firmId: firm.id, userId: user.id, role: "ADMIN" },
        {
          importId: importRecord.importRecord.id,
          templateName: "Invalid Template",
          sourceColumns: ["Employee", "Tax"],
          columnMap: {
            employeeName: "Employee",
            tax1: "Tax"
          }
        }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects templates scoped to another client in the same firm", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const clientA = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Client A",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const clientB = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Client B",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRunA = await createPayRun(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: clientA.id,
        periodStart: new Date("2027-04-01"),
        periodEnd: new Date("2027-04-30")
      }
    );
    const payRunB = await createPayRun(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: clientB.id,
        periodStart: new Date("2027-05-01"),
        periodEnd: new Date("2027-05-31")
      }
    );

    const hashA = await sha256FromString("client-a-template");
    const importA = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRunA.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRunA.id, "REGISTER", "a.csv"),
        fileHashSha256: hashA,
        originalFilename: "a.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    const template = await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        importId: importA.importRecord.id,
        templateName: "Client A Template",
        sourceColumns: ["Employee", "Net", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax"
        }
      }
    );

    const hashB = await sha256FromString("client-b-import");
    const importB = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRunB.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRunB.id, "REGISTER", "b.csv"),
        fileHashSha256: hashB,
        originalFilename: "b.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await expect(
      applyMappingTemplate(
        { firmId: firm.id, userId: user.id, role: "ADMIN" },
        {
          importId: importB.importRecord.id,
          templateId: template.templateId,
          sourceColumns: ["Employee", "Net", "Tax"],
          columnMap: {
            employeeName: "Employee",
            netPay: "Net",
            tax1: "Tax"
          }
        }
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects template use across firms", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "First Firm Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: client.id,
        periodStart: new Date("2026-02-01"),
        periodEnd: new Date("2026-02-28")
      }
    );
    const importHash = await sha256FromString("firm-a");
    const importRecord = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "a.csv"),
        fileHashSha256: importHash,
        originalFilename: "a.csv",
        mimeType: "text/csv",
        sizeBytes: 100
      }
    );

    const template = await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        importId: importRecord.importRecord.id,
        templateName: "Firm A Register",
        sourceColumns: ["Employee", "Net", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax"
        }
      }
    );

    const other = await createFirmWithUser("ADMIN");
    const otherClient = await createClient(
      { firmId: other.firm.id, userId: other.user.id },
      {
        name: "Second Firm Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const otherPayRun = await createPayRun(
      { firmId: other.firm.id, userId: other.user.id, role: "ADMIN" },
      {
        clientId: otherClient.id,
        periodStart: new Date("2026-03-01"),
        periodEnd: new Date("2026-03-31")
      }
    );
    const otherHash = await sha256FromString("firm-b");
    const otherImport = await createParsedImport(
      { firmId: other.firm.id, userId: other.user.id, role: "ADMIN" },
      {
        payRunId: otherPayRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(
          other.firm.id,
          otherPayRun.id,
          "REGISTER",
          "b.csv"
        ),
        fileHashSha256: otherHash,
        originalFilename: "b.csv",
        mimeType: "text/csv",
        sizeBytes: 100
      }
    );

    await expect(
      applyMappingTemplate(
        { firmId: other.firm.id, userId: other.user.id, role: "ADMIN" },
        {
          importId: otherImport.importRecord.id,
          templateId: template.templateId,
          sourceColumns: ["Employee", "Net", "Tax"],
          columnMap: {
            employeeName: "Employee",
            netPay: "Net",
            tax1: "Tax"
          }
        }
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("blocks template changes on locked pay runs", async () => {
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
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: client.id,
        periodStart: new Date("2027-06-01"),
        periodEnd: new Date("2027-06-30")
      }
    );
    const importHash = await sha256FromString("register-locked");
    const importRecord = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "locked.csv"),
        fileHashSha256: importHash,
        originalFilename: "locked.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "LOCKED" }
    });

    await expect(
      applyMappingTemplate(
        { firmId: firm.id, userId: user.id, role: "ADMIN" },
        {
          importId: importRecord.importRecord.id,
          templateName: "Locked Template",
          sourceColumns: ["Employee", "Net", "Tax"],
          columnMap: {
            employeeName: "Employee",
            netPay: "Net",
            tax1: "Tax"
          }
        }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("skips auto-transition when pay runs are already mapped", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Mapped Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: client.id,
        periodStart: new Date("2027-07-01"),
        periodEnd: new Date("2027-07-31")
      }
    );
    const importHash = await sha256FromString("register-mapped");
    const importRecord = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "mapped.csv"),
        fileHashSha256: importHash,
        originalFilename: "mapped.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "MAPPED" }
    });

    await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        importId: importRecord.importRecord.id,
        templateName: "Mapped Template",
        sourceColumns: ["Employee", "Net", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax"
        }
      }
    );

    const updated = await prisma.payRun.findFirst({
      where: { id: payRun.id }
    });
    expect(updated?.status).toBe("MAPPED");
  });

  it("publishes a template version and deprecates other active versions", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Status Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: client.id,
        periodStart: new Date("2027-08-01"),
        periodEnd: new Date("2027-08-31")
      }
    );

    const baseHash = await sha256FromString("status-base");
    const baseImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "base.csv"),
        fileHashSha256: baseHash,
        originalFilename: "base.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    const baseTemplate = await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        importId: baseImport.importRecord.id,
        templateName: "Status Template",
        sourceColumns: ["Employee", "Net", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax"
        }
      }
    );

    const nextHash = await sha256FromString("status-next");
    const nextImport = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "next.csv"),
        fileHashSha256: nextHash,
        originalFilename: "next.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        importId: nextImport.importRecord.id,
        templateId: baseTemplate.templateId,
        sourceColumns: ["Employee", "Net", "Tax", "Gross"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax",
          grossPay: "Gross"
        },
        createNewVersion: true
      }
    );

    await updateTemplateStatus(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      baseTemplate.templateId,
      "ACTIVE"
    );

    const templates = await prisma.mappingTemplate.findMany({
      where: { firmId: firm.id, name: "Status Template" },
      orderBy: { version: "asc" }
    });
    expect(templates).toHaveLength(2);
    expect(templates[0]?.status).toBe("ACTIVE");
    expect(templates[1]?.status).toBe("DEPRECATED");

    const publishedEvents = await prisma.auditEvent.findMany({
      where: { entityId: baseTemplate.templateId, action: "TEMPLATE_PUBLISHED" }
    });
    expect(publishedEvents).toHaveLength(2);
  });

  it("records deprecation events for templates", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Deprecate Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: client.id,
        periodStart: new Date("2027-09-01"),
        periodEnd: new Date("2027-09-30")
      }
    );
    const hash = await sha256FromString("status-deprecate");
    const importRecord = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "dep.csv"),
        fileHashSha256: hash,
        originalFilename: "dep.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    const template = await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        importId: importRecord.importRecord.id,
        templateName: "Deprecate Template",
        sourceColumns: ["Employee", "Net", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax"
        }
      }
    );

    await updateTemplateStatus(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      template.templateId,
      "DEPRECATED"
    );

    const updated = await prisma.mappingTemplate.findFirst({
      where: { id: template.templateId }
    });
    expect(updated?.status).toBe("DEPRECATED");

    const event = await prisma.auditEvent.findFirst({
      where: { entityId: template.templateId, action: "TEMPLATE_DEPRECATED" }
    });
    expect(event).toBeTruthy();
  });

  it("enforces firm scoping on status changes", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const { firm: otherFirm, user: otherUser } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Scoped Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: client.id,
        periodStart: new Date("2027-10-01"),
        periodEnd: new Date("2027-10-31")
      }
    );
    const hash = await sha256FromString("scoped-template");
    const importRecord = await createParsedImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "scoped.csv"),
        fileHashSha256: hash,
        originalFilename: "scoped.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    const template = await applyMappingTemplate(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        importId: importRecord.importRecord.id,
        templateName: "Scoped Template",
        sourceColumns: ["Employee", "Net", "Tax"],
        columnMap: {
          employeeName: "Employee",
          netPay: "Net",
          tax1: "Tax"
        }
      }
    );

    await expect(
      updateTemplateStatus(
        { firmId: otherFirm.id, userId: otherUser.id, role: "ADMIN" },
        template.templateId,
        "ACTIVE"
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects applying templates to imports that failed validation", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Error Import Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        clientId: client.id,
        periodStart: new Date("2026-10-01"),
        periodEnd: new Date("2026-10-31")
      }
    );

    const importRecord = await createImport(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: buildStorageKey(firm.id, payRun.id, "REGISTER", "error.csv"),
        fileHashSha256: await sha256FromString("register-error"),
        originalFilename: "error.csv",
        mimeType: "text/csv",
        sizeBytes: 120
      }
    );

    await prisma.import.update({
      where: { id: importRecord.importRecord.id },
      data: {
        parseStatus: "ERROR_PARSE_FAILED",
        errorCode: "ERROR_PARSE_FAILED",
        errorMessage: "Failed to parse."
      }
    });

    await expect(
      applyMappingTemplate(
        { firmId: firm.id, userId: user.id, role: "ADMIN" },
        {
          importId: importRecord.importRecord.id,
          templateName: "Register Template",
          sourceColumns: ["Employee", "Net"],
          columnMap: {
            employeeName: "Employee",
            netPay: "Net"
          }
        }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns early when updating to the same template status", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Status Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    const template = await prisma.mappingTemplate.create({
      data: {
        firmId: firm.id,
        clientId: client.id,
        sourceType: "REGISTER",
        name: "Status Template",
        version: 1,
        status: "ACTIVE",
        sourceColumns: ["Employee"],
        columnMap: { employeeName: "Employee" },
        createdByUserId: user.id
      }
    });

    const updated = await updateTemplateStatus(
      { firmId: firm.id, userId: user.id, role: "ADMIN" },
      template.id,
      "ACTIVE"
    );

    expect(updated.status).toBe("ACTIVE");
    expect(updated.id).toBe(template.id);
  });
});
