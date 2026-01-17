import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

const resetEnv = () => {
  process.env = { ...originalEnv };
};

describe("env parsing", () => {
  afterEach(() => {
    resetEnv();
    vi.resetModules();
  });

  it("parses required environment variables", async () => {
    resetEnv();
    const { env } = await import("@/lib/env");
    expect(env.SESSION_SECRET).toBe(process.env.SESSION_SECRET);
    expect(env.S3_BUCKET).toBe(process.env.S3_BUCKET);
  });

  it("throws when required variables are invalid", async () => {
    resetEnv();
    process.env.SESSION_SECRET = "short";
    await expect(import("@/lib/env")).rejects.toThrow();
  });
});
