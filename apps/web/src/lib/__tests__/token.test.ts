import { describe, expect, it } from "vitest";
import { generateInviteToken, hashToken } from "@/lib/token";

describe("token helpers", () => {
  it("hashes a token deterministically", () => {
    expect(hashToken("sample-token")).toBe(hashToken("sample-token"));
  });

  it("generates a token and matching hash", () => {
    const { token, tokenHash } = generateInviteToken();
    expect(token).toBeTypeOf("string");
    expect(tokenHash).toBe(hashToken(token));
  });
});
