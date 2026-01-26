import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "@/lib/errors";

const prismaMock = vi.hoisted(() => ({
  client: {
    create: vi.fn(),
    findFirst: vi.fn()
  },
  payRun: {
    create: vi.fn(),
    findFirst: vi.fn()
  },
  import: {
    create: vi.fn(),
    findFirst: vi.fn()
  }
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock
}));

import { createClient } from "@/lib/clients";
import { createPayRun } from "@/lib/pay-runs";
import { createImport } from "@/lib/imports";
import { NotFoundError } from "@/lib/errors";

describe("prisma error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps client unique constraint violations", async () => {
    const error = Object.assign(new Error("Unique"), { code: "P2002" });
    prismaMock.client.create.mockRejectedValueOnce(error);

    await expect(
      createClient(
        { firmId: "firm-1", userId: "user-1" },
        {
          name: "Duplicate",
          payrollSystem: "BRIGHTPAY",
          payrollFrequency: "MONTHLY"
        }
      )
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rethrows unexpected client creation errors", async () => {
    prismaMock.client.create.mockRejectedValueOnce(new Error("boom"));

    await expect(
      createClient(
        { firmId: "firm-1", userId: "user-1" },
        {
          name: "Explode",
          payrollSystem: "BRIGHTPAY",
          payrollFrequency: "MONTHLY"
        }
      )
    ).rejects.toThrow("boom");
  });

  it("rethrows unexpected pay run creation errors", async () => {
    prismaMock.client.findFirst.mockResolvedValueOnce({
      id: "client-1",
      payrollFrequency: "MONTHLY"
    });
    prismaMock.payRun.create.mockRejectedValueOnce(new Error("boom"));

    await expect(
      createPayRun(
        { firmId: "firm-1", userId: "user-1", role: "ADMIN" },
        {
          clientId: "client-1",
          periodStart: new Date("2026-01-01"),
          periodEnd: new Date("2026-01-31")
        }
      )
    ).rejects.toThrow("boom");
  });

  it("maps import unique constraint violations", async () => {
    prismaMock.payRun.findFirst.mockResolvedValueOnce({
      id: "pay-run-1",
      clientId: "client-1",
      status: "IMPORTED"
    });
    prismaMock.client.findFirst.mockResolvedValueOnce({ id: "client-1" });
    prismaMock.import.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.import.create.mockRejectedValueOnce(
      Object.assign(new Error("Unique"), { code: "P2002" })
    );

    await expect(
      createImport(
        { firmId: "firm-1", userId: "user-1", role: "ADMIN" },
        {
          payRunId: "pay-run-1",
          sourceType: "REGISTER",
          storageKey: "firm/firm-1/pay-run/pay-run-1/REGISTER/file.csv",
          fileHashSha256: "hash",
          originalFilename: "file.csv",
          mimeType: "text/csv",
          sizeBytes: 120
        }
      )
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects imports when the client is missing", async () => {
    prismaMock.payRun.findFirst.mockResolvedValueOnce({
      id: "pay-run-1",
      clientId: "client-1",
      status: "IMPORTED"
    });
    prismaMock.client.findFirst.mockResolvedValueOnce(null);

    await expect(
      createImport(
        { firmId: "firm-1", userId: "user-1", role: "ADMIN" },
        {
          payRunId: "pay-run-1",
          sourceType: "REGISTER",
          storageKey: "firm/firm-1/pay-run/pay-run-1/REGISTER/file.csv",
          fileHashSha256: "hash",
          originalFilename: "file.csv",
          mimeType: "text/csv",
          sizeBytes: 120
        }
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
