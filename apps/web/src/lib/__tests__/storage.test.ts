import { describe, expect, it } from "vitest";
import { storageBucket, storageClient } from "@/lib/storage";

describe("storage config", () => {
  it("uses the configured bucket", () => {
    expect(storageBucket).toBe(process.env.S3_BUCKET);
  });

  it("creates a storage client", () => {
    expect(storageClient).toBeTruthy();
  });
});
