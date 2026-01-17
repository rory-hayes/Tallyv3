import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@tally/db";
import { prisma } from "@tally/db";

const { redirect, getSession } = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
  getSession: vi.fn()
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("../session", () => ({ getSession }));

import {
  createSessionForUser,
  getActiveUser,
  hashPassword,
  requireSession,
  requireUser,
  verifyPassword
} from "../auth";

describe("auth helpers", () => {
  beforeEach(() => {
    redirect.mockClear();
    getSession.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies and hashes passwords", async () => {
    const hash = await hashPassword("secret");
    expect(hash).not.toBe("secret");
    expect(await verifyPassword("secret", hash)).toBe(true);
    expect(await verifyPassword("secret", null)).toBe(false);
  });

  it("requires a session", async () => {
    getSession.mockResolvedValue({ userId: "user-1" });
    const session = await requireSession();
    expect(session.userId).toBe("user-1");
  });

  it("redirects when session is missing", async () => {
    getSession.mockResolvedValue({ userId: null });
    await expect(requireSession()).rejects.toThrow("redirect");
  });

  it("loads an active user", async () => {
    const user = {
      id: "user-1",
      firmId: "firm-1",
      email: "user@example.com",
      role: "ADMIN",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date()
    } as User;
    getSession.mockResolvedValue({ userId: "user-1" });
    vi.spyOn(prisma.user, "findFirst").mockResolvedValue(user);

    const result = await requireUser();
    expect(result.user.id).toBe("user-1");
  });

  it("redirects when user is not active", async () => {
    getSession.mockResolvedValue({ userId: "user-2" });
    vi.spyOn(prisma.user, "findFirst").mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow("redirect");
  });

  it("creates a session for a user", async () => {
    const session = { save: vi.fn() } as { save: () => Promise<void> };
    getSession.mockResolvedValue(session);

    const user = {
      id: "user-3",
      firmId: "firm-1",
      email: "user@example.com",
      role: "ADMIN",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date()
    } as User;

    await createSessionForUser(user);
    expect(session.save).toHaveBeenCalled();
  });

  it("returns active user or null", async () => {
    getSession.mockResolvedValue({ userId: null });
    expect(await getActiveUser()).toBeNull();

    const user = {
      id: "user-4",
      firmId: "firm-1",
      email: "user@example.com",
      role: "ADMIN",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date()
    } as User;
    getSession.mockResolvedValue({ userId: "user-4" });
    vi.spyOn(prisma.user, "findFirst").mockResolvedValue(user);

    expect(await getActiveUser()).toEqual(user);
  });
});
