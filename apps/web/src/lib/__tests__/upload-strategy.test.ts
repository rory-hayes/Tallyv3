import { describe, expect, it } from "vitest";
import { resolveUploadStrategy } from "@/lib/upload-strategy";

describe("resolveUploadStrategy", () => {
  it("defaults to proxy when mode is not set", () => {
    expect(resolveUploadStrategy({ mode: undefined, hasSignedUrl: true })).toBe(
      "proxy"
    );
  });

  it("uses direct when configured and a signed URL is present", () => {
    expect(resolveUploadStrategy({ mode: "direct", hasSignedUrl: true })).toBe(
      "direct"
    );
  });

  it("falls back to proxy when direct mode lacks a signed URL", () => {
    expect(resolveUploadStrategy({ mode: "direct", hasSignedUrl: false })).toBe(
      "proxy"
    );
  });

  it("respects proxy mode", () => {
    expect(resolveUploadStrategy({ mode: "proxy", hasSignedUrl: true })).toBe(
      "proxy"
    );
  });

  it("treats unknown values as proxy", () => {
    expect(resolveUploadStrategy({ mode: "auto", hasSignedUrl: true })).toBe(
      "proxy"
    );
  });
});
