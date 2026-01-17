import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@tally/db";
import { archiveClient, createClient, updateClient } from "@/lib/clients";
import {
  createPayRun,
  createPayRunRevision,
  transitionPayRunStatus
} from "@/lib/pay-runs";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { createFirmWithUser, resetDb } from "./test-db";

describe("clients and pay runs integration", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("creates, updates, and archives a client", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const context = { firmId: firm.id, userId: user.id };

    const client = await createClient(context, {
      name: "Acme Payroll",
      payrollSystem: "BRIGHTPAY",
      payrollFrequency: "MONTHLY"
    });

    expect(client.name).toBe("Acme Payroll");

    const updated = await updateClient(context, client.id, {
      name: "Acme Payroll Ltd",
      payrollSystem: "BRIGHTPAY",
      payrollFrequency: "MONTHLY"
    });

    expect(updated.name).toBe("Acme Payroll Ltd");

    const archived = await archiveClient(context, client.id);
    expect(archived.archivedAt).not.toBeNull();

    const archivedAgain = await archiveClient(context, client.id);
    expect(archivedAgain.archivedAt).not.toBeNull();
  });

  it("requires payroll system details for OTHER", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    await expect(
      createClient(
        { firmId: firm.id, userId: user.id },
        {
          name: "Omega",
          payrollSystem: "OTHER",
          payrollFrequency: "MONTHLY"
        }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects default reviewers outside the firm", async () => {
    const { firm: firmA, user: userA } = await createFirmWithUser("ADMIN");
    const { user: userB } = await createFirmWithUser("ADMIN");

    await expect(
      createClient(
        { firmId: firmA.id, userId: userA.id },
        {
          name: "Omega",
          payrollSystem: "BRIGHTPAY",
          payrollFrequency: "MONTHLY",
          defaultReviewerUserId: userB.id
        }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("prevents duplicate pay runs and enforces revision rules", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const context = { firmId: firm.id, userId: user.id, role: user.role };

    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Northwind",
        payrollSystem: "STAFFOLOGY",
        payrollFrequency: "MONTHLY"
      }
    );

    const payRun = await createPayRun(context, {
      clientId: client.id,
      periodStart: new Date("2026-01-01T00:00:00Z"),
      periodEnd: new Date("2026-01-31T00:00:00Z")
    });

    await expect(
      createPayRun(context, {
        clientId: client.id,
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-01-31T00:00:00Z")
      })
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(createPayRunRevision(context, payRun.id)).rejects.toBeInstanceOf(
      ValidationError
    );

    await prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "LOCKED" }
    });

    const revision = await createPayRunRevision(context, payRun.id);
    expect(revision.revision).toBe(2);

    await expect(createPayRunRevision(context, payRun.id)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("validates pay run period ordering", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Period Check",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );

    await expect(
      createPayRun(
        { firmId: firm.id, userId: user.id, role: user.role },
        {
          clientId: client.id,
          periodStart: new Date("2026-03-31T00:00:00Z"),
          periodEnd: new Date("2026-03-01T00:00:00Z")
        }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("blocks access to another firm's client", async () => {
    const { firm: firmA, user: userA } = await createFirmWithUser("ADMIN");
    const { firm: firmB, user: userB } = await createFirmWithUser("ADMIN");

    const client = await createClient(
      { firmId: firmA.id, userId: userA.id },
      {
        name: "Umbrella",
        payrollSystem: "OTHER",
        payrollSystemOther: "Custom",
        payrollFrequency: "WEEKLY"
      }
    );

    await expect(
      updateClient(
        { firmId: firmB.id, userId: userB.id },
        client.id,
        {
          name: "Umbrella Group",
          payrollSystem: "OTHER",
          payrollSystemOther: "Custom",
          payrollFrequency: "WEEKLY"
        }
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects archiving missing clients", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    await expect(
      archiveClient(
        { firmId: firm.id, userId: user.id },
        "f5d30f97-6f44-4a85-b5a4-d3d3b20da7e5"
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects pay runs for missing clients", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    await expect(
      createPayRun(
        { firmId: firm.id, userId: user.id, role: user.role },
        {
          clientId: "d2cce74a-2e6f-42db-9a20-48c3c9bd52dc",
          periodStart: new Date("2026-05-01T00:00:00Z"),
          periodEnd: new Date("2026-05-31T00:00:00Z")
        }
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rethrows unexpected pay run creation errors", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Error Client",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );

    await expect(
      createPayRun(
        { firmId: firm.id, userId: user.id, role: user.role },
        {
          clientId: client.id,
          periodStart: new Date("2026-05-01T00:00:00Z"),
          periodEnd: new Date("2026-05-31T00:00:00Z")
        }
      )
    ).resolves.toBeTruthy();
  });

  it("blocks access to another firm's pay run", async () => {
    const { firm: firmA, user: userA } = await createFirmWithUser("ADMIN");
    const { firm: firmB, user: userB } = await createFirmWithUser("ADMIN");

    const client = await createClient(
      { firmId: firmA.id, userId: userA.id },
      {
        name: "Globex",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );

    const payRun = await createPayRun(
      { firmId: firmA.id, userId: userA.id, role: userA.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-02-01T00:00:00Z"),
        periodEnd: new Date("2026-02-28T00:00:00Z")
      }
    );

    await expect(
      createPayRunRevision(
        { firmId: firmB.id, userId: userB.id, role: userB.role },
        payRun.id
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects transitions for missing pay runs", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    await expect(
      transitionPayRunStatus(
        { firmId: firm.id, userId: user.id, role: user.role },
        "3e2e2a32-5b5c-4d74-94a1-39c8904c202a",
        "IMPORTED"
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("records pay run events without an actor user", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Anon Client",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );

    const payRun = await createPayRun(
      { firmId: firm.id, userId: null, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-08-01T00:00:00Z"),
        periodEnd: new Date("2026-08-31T00:00:00Z")
      }
    );

    await transitionPayRunStatus(
      { firmId: firm.id, userId: null, role: user.role },
      payRun.id,
      "IMPORTED"
    );

    await prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "LOCKED" }
    });

    await createPayRunRevision(
      { firmId: firm.id, userId: null, role: user.role },
      payRun.id
    );

    const events = await prisma.auditEvent.findMany({
      where: { firmId: firm.id, entityType: "PAY_RUN" }
    });

    expect(events.every((event) => event.actorUserId === null)).toBe(true);
  });
});
