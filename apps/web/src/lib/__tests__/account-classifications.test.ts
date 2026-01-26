import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createClient } from "@/lib/clients";
import {
  deleteAccountClassification,
  listAccountClassifications,
  upsertAccountClassification
} from "@/lib/account-classifications";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createFirmWithUser, resetDb } from "./test-db";

describe("account classifications", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("creates, updates, lists, and deletes classifications", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Account Client",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );

    const created = await upsertAccountClassification(
      { firmId: firm.id, userId: user.id, role: user.role },
      client.id,
      {
        accountCode: " 1000 ",
        accountName: " Payroll ",
        classification: "EXPENSE"
      }
    );

    expect(created.accountCode).toBe("1000");
    expect(created.accountName).toBe("Payroll");

    const cleared = await upsertAccountClassification(
      { firmId: firm.id, userId: user.id, role: user.role },
      client.id,
      {
        accountCode: "1000",
        accountName: null,
        classification: "NET_PAYABLE"
      }
    );

    expect(cleared.classification).toBe("NET_PAYABLE");
    expect(cleared.accountName).toBeNull();

    const updated = await upsertAccountClassification(
      { firmId: firm.id, userId: user.id, role: user.role },
      client.id,
      {
        accountCode: "1000",
        accountName: "Updated",
        classification: "NET_PAYABLE"
      }
    );

    expect(updated.accountName).toBe("Updated");

    await upsertAccountClassification(
      { firmId: firm.id, userId: user.id, role: user.role },
      client.id,
      {
        accountCode: "2000",
        accountName: null,
        classification: "EXPENSE"
      }
    );

    const listed = await listAccountClassifications(firm.id, client.id);
    expect(listed).toHaveLength(2);
    expect(listed[0]?.accountCode).toBe("1000");

    await deleteAccountClassification(
      { firmId: firm.id, userId: user.id, role: user.role },
      updated.id
    );

    const count = await prisma.accountClassification.count({
      where: { clientId: client.id }
    });
    expect(count).toBe(1);
  });

  it("rejects empty account codes", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Account Client 2",
        payrollSystem: "OTHER",
        payrollSystemOther: "Other",
        payrollFrequency: "MONTHLY"
      }
    );

    await expect(
      upsertAccountClassification(
        { firmId: firm.id, userId: user.id, role: user.role },
        client.id,
        {
          accountCode: "   ",
          accountName: "Blank",
          classification: "EXPENSE"
        }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires a valid client for upsert", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const missingClientId = randomUUID();

    await expect(
      upsertAccountClassification(
        { firmId: firm.id, userId: user.id, role: user.role },
        missingClientId,
        {
          accountCode: "2000",
          accountName: "Missing",
          classification: "EXPENSE"
        }
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects deleting unknown classifications", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const missingId = randomUUID();

    await expect(
      deleteAccountClassification(
        { firmId: firm.id, userId: user.id, role: user.role },
        missingId
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
