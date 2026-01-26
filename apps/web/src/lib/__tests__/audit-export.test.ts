import { beforeEach, describe, expect, it } from "vitest";
import { buildAuditCsv, getAuditExportRows } from "@/lib/audit-export";
import { createClient } from "@/lib/clients";
import { createPayRun } from "@/lib/pay-runs";
import { createFirmWithUser, resetDb } from "./test-db";

describe("audit export", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("filters audit events by client scope", async () => {
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
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: clientA.id,
        periodStart: new Date("2026-10-01T00:00:00Z"),
        periodEnd: new Date("2026-10-31T00:00:00Z")
      }
    );
    const payRunB = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: clientB.id,
        periodStart: new Date("2026-11-01T00:00:00Z"),
        periodEnd: new Date("2026-11-30T00:00:00Z")
      }
    );

    const rows = await getAuditExportRows({
      firmId: firm.id,
      clientId: clientA.id
    });

    const entityIds = rows.map((row) => row.entityId).filter(Boolean);
    expect(entityIds).toContain(clientA.id);
    expect(entityIds).toContain(payRunA.id);
    expect(entityIds).not.toContain(clientB.id);
    expect(entityIds).not.toContain(payRunB.id);
  });

  it("returns firm events without client filters", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Client C",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );
    await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-12-01T00:00:00Z"),
        periodEnd: new Date("2026-12-31T00:00:00Z")
      }
    );

    const rows = await getAuditExportRows({ firmId: firm.id });
    expect(rows.length).toBeGreaterThan(0);
  });

  it("escapes CSV values with commas and quotes", () => {
    const csv = buildAuditCsv([
      {
        id: "row-1",
        timestamp: new Date("2026-01-01T00:00:00Z"),
        action: "TEST_ACTION",
        entityType: "CLIENT",
        entityId: "id,1",
        actorEmail: 'test"user@example.com',
        metadata: { note: 'hello, "world"' }
      },
      {
        id: "row-2",
        timestamp: new Date("2026-01-02T00:00:00Z"),
        action: "NULL_ACTION",
        entityType: "FIRM",
        entityId: null,
        actorEmail: null,
        metadata: null
      }
    ]);

    expect(csv).toContain("\"id,1\"");
    expect(csv).toContain("\"test\"\"user@example.com\"");
    expect(csv).toContain("\"{");
    expect(csv).toContain("NULL_ACTION");
  });
});
