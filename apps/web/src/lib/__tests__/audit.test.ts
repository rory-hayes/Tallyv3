import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { sanitizeAuditMetadata } from "@/lib/audit-metadata";
import { recordAuditEvent } from "@/lib/audit";
import { createFirmWithUser, resetDb } from "./test-db";
import { randomUUID } from "crypto";

describe("audit metadata sanitization", () => {
  it("strips PII-like keys and non-primitives", () => {
    const result = sanitizeAuditMetadata({
      email: "test@example.com",
      role: "ADMIN",
      count: 2,
      details: { nested: true },
      accountNumber: "12345678"
    });

    expect(result).toEqual({
      role: "ADMIN",
      count: 2
    });
  });

  it("returns null when no safe metadata remains", () => {
    const result = sanitizeAuditMetadata({
      name: "Test User",
      email: "test@example.com"
    });

    expect(result).toBeNull();
  });

  it("returns null for undefined metadata", () => {
    expect(sanitizeAuditMetadata()).toBeNull();
  });
});

describe("audit events", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("records events with and without metadata", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");

    const clientId = randomUUID();
    await recordAuditEvent(
      {
        action: "CLIENT_CREATED",
        entityType: "CLIENT",
        entityId: clientId,
        metadata: {
          payrollSystem: "OTHER",
          email: "redacted@example.com"
        }
      },
      { firmId: firm.id, actorUserId: user.id }
    );

    await recordAuditEvent(
      {
        action: "CLIENT_UPDATED",
        entityType: "CLIENT",
        entityId: clientId
      },
      { firmId: firm.id }
    );

    const events = await prisma.auditEvent.findMany({
      where: { firmId: firm.id },
      orderBy: { timestamp: "asc" }
    });

    expect(events[0]?.metadata).toEqual({ payrollSystem: "OTHER" });
    expect(events[1]?.metadata).toBeNull();
    expect(events[1]?.actorUserId).toBeNull();
  });

  it("stores null entity ids when omitted", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");

    await recordAuditEvent(
      {
        action: "CLIENT_UPDATED",
        entityType: "CLIENT",
        metadata: { payrollSystem: "OTHER" }
      },
      { firmId: firm.id, actorUserId: user.id }
    );

    const event = await prisma.auditEvent.findFirst({
      where: { firmId: firm.id }
    });

    expect(event?.entityId).toBeNull();
  });
});
