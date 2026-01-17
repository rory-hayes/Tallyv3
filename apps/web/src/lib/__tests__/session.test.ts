import { beforeEach, describe, expect, it, vi } from "vitest";

const { getIronSession, cookies } = vi.hoisted(() => ({
  getIronSession: vi.fn(),
  cookies: vi.fn(() => "cookie-store")
}));

vi.mock("iron-session", () => ({ getIronSession }));
vi.mock("next/headers", () => ({ cookies }));

import { destroySession, getSession } from "../session";

describe("session helpers", () => {
  beforeEach(() => {
    getIronSession.mockReset();
    cookies.mockClear();
  });

  it("creates a session with cookie store", async () => {
    const session = { destroy: vi.fn() };
    getIronSession.mockResolvedValue(session);

    const result = await getSession();
    expect(result).toBe(session);
    expect(cookies).toHaveBeenCalled();
  });

  it("destroys the session", async () => {
    const session = { destroy: vi.fn() };
    getIronSession.mockResolvedValue(session);

    await destroySession();
    expect(session.destroy).toHaveBeenCalled();
  });
});
