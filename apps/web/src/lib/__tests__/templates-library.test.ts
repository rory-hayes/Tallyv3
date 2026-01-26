import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/clients";
import { createPayRun } from "@/lib/pay-runs";
import { getTemplateLibraryData } from "@/lib/templates-library";
import { createFirmWithUser, resetDb } from "./test-db";

describe("template library data", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns latest templates with drift, last used, and firm scoping", async () => {
    const { firm: firmA, user: userA } = await createFirmWithUser("ADMIN");
    const { firm: firmB, user: userB } = await createFirmWithUser("ADMIN");

    const clientA = await createClient(
      { firmId: firmA.id, userId: userA.id },
      {
        name: "Acme Payroll",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );

    const clientB = await createClient(
      { firmId: firmB.id, userId: userB.id },
      {
        name: "Other Firm",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );

    const payRun = await createPayRun(
      { firmId: firmA.id, userId: userA.id, role: "ADMIN" },
      {
        clientId: clientA.id,
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-01-31")
      }
    );

    const templateV1 = await prisma.mappingTemplate.create({
      data: {
        firmId: firmA.id,
        clientId: clientA.id,
        sourceType: "REGISTER",
        version: 1,
        name: "Register Template",
        status: "DRAFT",
        sourceColumns: ["Employee"],
        columnMap: { employeeName: "Employee" },
        createdByUserId: userA.id
      }
    });

    const templateV2 = await prisma.mappingTemplate.create({
      data: {
        firmId: firmA.id,
        clientId: clientA.id,
        sourceType: "REGISTER",
        version: 2,
        name: "Register Template",
        status: "ACTIVE",
        sourceColumns: ["Employee", "Net Pay"],
        columnMap: { employeeName: "Employee", netPay: "Net Pay" },
        createdByUserId: userA.id
      }
    });

    await prisma.mappingTemplate.create({
      data: {
        firmId: firmA.id,
        clientId: clientA.id,
        sourceType: "REGISTER",
        version: 1,
        name: "Stable Template",
        status: "ACTIVE",
        sourceColumns: ["Employee", "Net Pay"],
        columnMap: { employeeName: "Employee", netPay: "Net Pay" },
        createdByUserId: userA.id
      }
    });

    const stableTemplateV2 = await prisma.mappingTemplate.create({
      data: {
        firmId: firmA.id,
        clientId: clientA.id,
        sourceType: "REGISTER",
        version: 2,
        name: "Stable Template",
        status: "ACTIVE",
        sourceColumns: ["Employee", "Net Pay"],
        columnMap: { employeeName: "Employee", netPay: "Net Pay" },
        createdByUserId: userA.id
      }
    });

    await prisma.mappingTemplate.create({
      data: {
        firmId: firmA.id,
        clientId: clientA.id,
        sourceType: "GL",
        version: 1,
        name: "Bad Columns",
        status: "ACTIVE",
        sourceColumns: "Employee",
        columnMap: { accountCode: "Account" },
        createdByUserId: userA.id
      }
    });

    await prisma.mappingTemplate.create({
      data: {
        firmId: firmA.id,
        clientId: clientA.id,
        sourceType: "GL",
        version: 2,
        name: "Bad Columns",
        status: "ACTIVE",
        sourceColumns: ["Employee", "Net Pay"],
        columnMap: { accountCode: "Account" },
        createdByUserId: userA.id
      }
    });

    await prisma.mappingTemplate.create({
      data: {
        firmId: firmA.id,
        clientId: clientA.id,
        sourceType: "STATUTORY",
        version: 1,
        name: "Bad Latest",
        status: "ACTIVE",
        sourceColumns: ["Employee"],
        columnMap: { statutoryTotal: "Employee" },
        createdByUserId: userA.id
      }
    });

    await prisma.mappingTemplate.create({
      data: {
        firmId: firmA.id,
        clientId: clientA.id,
        sourceType: "STATUTORY",
        version: 2,
        name: "Bad Latest",
        status: "ACTIVE",
        sourceColumns: "Employee",
        columnMap: { statutoryTotal: "Employee" },
        createdByUserId: userA.id
      }
    });

    const firmTemplate = await prisma.mappingTemplate.create({
      data: {
        firmId: firmA.id,
        clientId: null,
        sourceType: "BANK",
        version: 1,
        name: "Bank Base",
        status: "ACTIVE",
        sourceColumns: ["Payee"],
        columnMap: { payeeName: "Payee" },
        createdByUserId: userA.id
      }
    });

    await prisma.mappingTemplate.create({
      data: {
        firmId: firmB.id,
        clientId: clientB.id,
        sourceType: "REGISTER",
        version: 1,
        name: "Other Template",
        status: "ACTIVE",
        sourceColumns: ["Employee"],
        columnMap: { employeeName: "Employee" },
        createdByUserId: userB.id
      }
    });

    const lastUsedAt = new Date("2026-02-01T00:00:00Z");
    await prisma.import.create({
      data: {
        firmId: firmA.id,
        clientId: clientA.id,
        payRunId: payRun.id,
        sourceType: "REGISTER",
        version: 1,
        storageUri: "s3://bucket/firm-a/register.csv",
        fileHashSha256: "hash",
        originalFilename: "register.csv",
        mimeType: "text/csv",
        sizeBytes: 120,
        uploadedByUserId: userA.id,
        parseStatus: "PARSED",
        mappingTemplateVersionId: templateV2.id,
        uploadedAt: lastUsedAt
      }
    });

    const clientScoped = await getTemplateLibraryData(firmA.id, {
      scope: "client",
      sourceType: "REGISTER"
    });

    expect(clientScoped.templates).toHaveLength(2);
    const registerEntry = clientScoped.templates.find(
      (entry) => entry.template.id === templateV2.id
    );
    expect(registerEntry?.drift).toBe("Changed");
    expect(registerEntry?.lastUsed?.toISOString()).toBe(
      lastUsedAt.toISOString()
    );

    const firmScoped = await getTemplateLibraryData(firmA.id, { scope: "firm" });
    expect(
      firmScoped.templates.some((entry) => entry.template.id === firmTemplate.id)
    ).toBe(true);
    expect(
      firmScoped.templates.some((entry) => entry.template.firmId !== firmA.id)
    ).toBe(false);

    const allTemplates = await getTemplateLibraryData(firmA.id, {});
    expect(
      allTemplates.templates.some((entry) => entry.template.id === templateV1.id)
    ).toBe(false);

    const queryResults = await getTemplateLibraryData(firmA.id, {
      query: "Register"
    });
    expect(
      queryResults.templates.some(
        (entry) => entry.template.id === templateV2.id
      )
    ).toBe(true);

    const statusFiltered = await getTemplateLibraryData(firmA.id, {
      status: "ACTIVE"
    });
    expect(
      statusFiltered.templates.some((entry) => entry.template.id === templateV1.id)
    ).toBe(false);

    const clientFiltered = await getTemplateLibraryData(firmA.id, {
      clientId: clientA.id
    });
    expect(
      clientFiltered.templates.some((entry) => entry.template.id === firmTemplate.id)
    ).toBe(false);

    const stableEntry = statusFiltered.templates.find(
      (entry) => entry.template.id === stableTemplateV2.id
    );
    expect(stableEntry?.drift).toBe("Stable");
  });

  it("handles empty template lists", async () => {
    const { firm } = await createFirmWithUser("ADMIN");

    const data = await getTemplateLibraryData(firm.id, {});
    expect(data.templates).toHaveLength(0);
    expect(data.clients).toHaveLength(0);
  });
});
