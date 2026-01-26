import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { requireUser } = vi.hoisted(() => ({
  requireUser: vi.fn()
}));

const prismaMock = vi.hoisted(() => ({
  exception: {
    findMany: vi.fn()
  },
  user: {
    findMany: vi.fn()
  },
  payRun: {
    findMany: vi.fn(),
    findFirst: vi.fn()
  }
}));

vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock
}));

import ExceptionsPage from "@/app/(app)/exceptions/page";
import PayRunExceptionsPage from "@/app/(app)/pay-runs/[payRunId]/exceptions/page";

describe("exceptions routes", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    requireUser.mockResolvedValue({
      session: { firmId: "firm-1", userId: "user-1" },
      user: { id: "user-1", firmId: "firm-1", role: "ADMIN" }
    });
    prismaMock.exception.findMany.mockReset();
    prismaMock.user.findMany.mockReset();
    prismaMock.payRun.findMany.mockReset();
    prismaMock.payRun.findFirst.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the empty state for the portfolio exceptions view", async () => {
    prismaMock.exception.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.payRun.findMany.mockResolvedValue([]);

    const element = await ExceptionsPage({ searchParams: {} });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("No exceptions match these filters.");
    expect(html).toContain("Exceptions are generated when reconciliation checks fail.");
  });

  it("renders the empty state for the pay run exceptions view", async () => {
    prismaMock.payRun.findFirst.mockResolvedValue({
      id: "pay-run-1",
      firmId: "firm-1",
      periodLabel: "Jan 2026",
      revision: 1,
      client: { name: "Acme Ltd" }
    });
    prismaMock.exception.findMany.mockResolvedValue([]);

    const element = await PayRunExceptionsPage({
      params: { payRunId: "pay-run-1" }
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("No exceptions for this pay run yet.");
    expect(html).toContain("Exceptions are generated when reconciliation checks fail.");
  });
});
