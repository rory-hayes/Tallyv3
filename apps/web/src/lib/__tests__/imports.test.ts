import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/clients";
import { createPayRun } from "@/lib/pay-runs";
import {
  assertStorageKeyMatches,
  createImport,
  isAllowedUpload
} from "@/lib/imports";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createFirmWithUser, resetDb } from "./test-db";

describe("import versioning and scoping", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("increments versions and detects duplicates", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Delta Payroll",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );

    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-03-01T00:00:00Z"),
        periodEnd: new Date("2026-03-31T00:00:00Z")
      }
    );

    const first = await createImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: `firm/${firm.id}/pay-run/${payRun.id}/REGISTER/file-1.csv`,
        fileHashSha256: "hash-one",
        originalFilename: "register.csv",
        mimeType: "text/csv",
        sizeBytes: 1200
      }
    );

    expect(first.importRecord.version).toBe(1);
    expect(first.duplicate).toBe(false);

    const second = await createImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: `firm/${firm.id}/pay-run/${payRun.id}/REGISTER/file-2.csv`,
        fileHashSha256: "hash-two",
        originalFilename: "register-rev.csv",
        mimeType: "text/csv",
        sizeBytes: 1400
      }
    );

    expect(second.importRecord.version).toBe(2);

    const duplicate = await createImport(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        payRunId: payRun.id,
        sourceType: "REGISTER",
        storageKey: `firm/${firm.id}/pay-run/${payRun.id}/REGISTER/file-3.csv`,
        fileHashSha256: "hash-two",
        originalFilename: "register-rev.csv",
        mimeType: "text/csv",
        sizeBytes: 1400
      }
    );

    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.importRecord.id).toBe(second.importRecord.id);

    const count = await prisma.import.count({
      where: { payRunId: payRun.id, sourceType: "REGISTER" }
    });
    expect(count).toBe(2);
  });

  it("prevents access across firms", async () => {
    const { firm: firmA, user: userA } = await createFirmWithUser("ADMIN");
    const { firm: firmB, user: userB } = await createFirmWithUser("ADMIN");

    const client = await createClient(
      { firmId: firmA.id, userId: userA.id },
      {
        name: "Aurora",
        payrollSystem: "STAFFOLOGY",
        payrollFrequency: "MONTHLY"
      }
    );

    const payRun = await createPayRun(
      { firmId: firmA.id, userId: userA.id, role: userA.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-04-01T00:00:00Z"),
        periodEnd: new Date("2026-04-30T00:00:00Z")
      }
    );

    await expect(
      createImport(
        { firmId: firmB.id, userId: userB.id, role: userB.role },
        {
          payRunId: payRun.id,
          sourceType: "BANK",
          storageKey: `firm/${firmB.id}/pay-run/${payRun.id}/BANK/file.csv`,
          fileHashSha256: "hash-three",
          originalFilename: "bank.csv",
          mimeType: "text/csv",
          sizeBytes: 500
        }
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("validates uploads and storage keys", () => {
    expect(isAllowedUpload("register.csv")).toBe(true);
    expect(isAllowedUpload("register.pdf", "application/pdf")).toBe(false);
    expect(() =>
      assertStorageKeyMatches("firm-1", "payrun-1", "firm/other/run.csv")
    ).toThrow(ValidationError);
  });

  it("blocks reviewers from uploading on draft pay runs", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const reviewer = await prisma.user.create({
      data: {
        firmId: firm.id,
        email: "reviewer@example.com",
        role: "REVIEWER",
        status: "ACTIVE"
      }
    });
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Orion",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-06-01T00:00:00Z"),
        periodEnd: new Date("2026-06-30T00:00:00Z")
      }
    );

    await expect(
      createImport(
        { firmId: firm.id, userId: reviewer.id, role: reviewer.role },
        {
          payRunId: payRun.id,
          sourceType: "REGISTER",
          storageKey: `firm/${firm.id}/pay-run/${payRun.id}/REGISTER/file.csv`,
          fileHashSha256: "hash-reviewer",
          originalFilename: "register.csv",
          mimeType: "text/csv",
          sizeBytes: 1200
        }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("blocks imports on locked pay runs", async () => {
    const { firm, user } = await createFirmWithUser("ADMIN");
    const client = await createClient(
      { firmId: firm.id, userId: user.id },
      {
        name: "Stark",
        payrollSystem: "BRIGHTPAY",
        payrollFrequency: "MONTHLY"
      }
    );
    const payRun = await createPayRun(
      { firmId: firm.id, userId: user.id, role: user.role },
      {
        clientId: client.id,
        periodStart: new Date("2026-07-01T00:00:00Z"),
        periodEnd: new Date("2026-07-31T00:00:00Z")
      }
    );
    await prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "LOCKED" }
    });

    await expect(
      createImport(
        { firmId: firm.id, userId: user.id, role: user.role },
        {
          payRunId: payRun.id,
          sourceType: "BANK",
          storageKey: `firm/${firm.id}/pay-run/${payRun.id}/BANK/file.csv`,
          fileHashSha256: "hash-locked",
          originalFilename: "bank.csv",
          mimeType: "text/csv",
          sizeBytes: 500
        }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

});
