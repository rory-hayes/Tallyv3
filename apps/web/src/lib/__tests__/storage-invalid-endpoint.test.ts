import { describe, expect, it, vi } from "vitest";

type StorageConfig = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  forcePathStyle?: boolean;
};

const mockCreateS3Client = vi.fn((config: StorageConfig) => ({ config }));

vi.mock("@tally/storage", () => ({
  createS3Client: mockCreateS3Client
}));

vi.mock("@/lib/env", () => ({
  env: {
    S3_ENDPOINT: "not-a-url",
    S3_REGION: "us-east-1",
    S3_BUCKET: "tally-dev",
    S3_ACCESS_KEY_ID: "access",
    S3_SECRET_ACCESS_KEY: "secret",
    S3_SESSION_TOKEN: undefined,
    S3_FORCE_PATH_STYLE: undefined
  }
}));

describe("storage invalid endpoints", () => {
  it("keeps invalid endpoints when URL parsing fails", async () => {
    const { storageClient } = await import("@/lib/storage");

    expect(storageClient).toEqual({
      config: expect.objectContaining({
        endpoint: "not-a-url",
        region: "us-east-1"
      })
    });
  });
});
