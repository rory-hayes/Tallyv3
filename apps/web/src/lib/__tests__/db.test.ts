import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

describe("db module", () => {
  it("exports a prisma client", () => {
    expect(prisma).toBeTruthy();
  });
});
