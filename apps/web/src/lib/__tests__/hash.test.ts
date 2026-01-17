import { describe, expect, it, vi } from "vitest";
import { sha256FromString, sha256Hex } from "@/lib/hash";

describe("hash utilities", () => {
  it("computes sha256 hex digests", async () => {
    const digest = await sha256FromString("hello");
    expect(digest).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });

  it("hashes array buffers", async () => {
    const buffer = new TextEncoder().encode("buffer").buffer;
    const digest = await sha256Hex(buffer);
    expect(digest).toMatch(/[a-f0-9]{64}/);
  });

  it("throws when crypto is unavailable", async () => {
    vi.stubGlobal("crypto", undefined);
    await expect(sha256Hex(new Uint8Array([1, 2, 3]))).rejects.toThrow(
      "Crypto subsystem unavailable."
    );
    vi.unstubAllGlobals();
  });
});
