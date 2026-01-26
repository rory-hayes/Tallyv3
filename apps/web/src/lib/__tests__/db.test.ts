import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { prisma as dbPrisma } from "@/lib/db";

describe("db module", () => {
  it("exports a prisma client", () => {
    expect(prisma).toBeTruthy();
  });

  it("re-exports prisma from db", () => {
    expect(dbPrisma).toBe(prisma);
  });
});
