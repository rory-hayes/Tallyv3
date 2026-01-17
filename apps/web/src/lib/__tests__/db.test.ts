import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("db module", () => {
  it("exports a prisma client", () => {
    expect(prisma).toBeTruthy();
  });
});
