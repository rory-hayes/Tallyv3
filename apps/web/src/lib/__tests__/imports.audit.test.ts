import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/clients";
import { createPayRun } from "@/lib/pay-runs";
import { createImport } from "@/lib/imports";
import { createFirmWithUser, resetDb } from "./test-db";

describe("import audit events", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("records upload and replacement audit events", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Nimbus",
        payrollSystem: "BRIGHTPAY",
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

    await createImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "GL",
        storageKey: `firm/${firm.id}/pay-run/${payRun.id}/GL/file-1.csv`,
        fileHashSha256: "hash-gl-1",
        originalFilename: "gl.csv",
        mimeType: "text/csv",
        sizeBytes: 2200
      }
    );

    await createImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "GL",
        storageKey: `firm/${firm.id}/pay-run/${payRun.id}/GL/file-2.csv`,
        fileHashSha256: "hash-gl-2",
        originalFilename: "gl-rev.csv",
        mimeType: "text/csv",
        sizeBytes: 2300
      }
    );

    const events = await prisma.auditEvent.findMany({
      where: {
        firmId: firm.id,
        entityType: "IMPORT"
      },
      orderBy: { timestamp: "asc" }
    });

    expect(events[0]?.action).toBe("IMPORT_UPLOADED");
    expect(events[1]?.action).toBe("IMPORT_REPLACED");
  });
});
