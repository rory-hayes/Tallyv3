import { afterEach, describe, expect, it, vi } from "vitest";

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

const originalEnv = {
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_REGION: process.env.S3_REGION,
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
  S3_SESSION_TOKEN: process.env.S3_SESSION_TOKEN,
  S3_BUCKET: process.env.S3_BUCKET,
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY
};

const restoreEnvValue = (key: keyof typeof originalEnv) => {
  const value = originalEnv[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

const loadStorage = async () => {
  vi.resetModules();
  return import("@/lib/storage");
};

afterEach(() => {
  restoreEnvValue("S3_ENDPOINT");
  restoreEnvValue("S3_REGION");
  restoreEnvValue("S3_FORCE_PATH_STYLE");
  restoreEnvValue("S3_SESSION_TOKEN");
  restoreEnvValue("S3_BUCKET");
  restoreEnvValue("S3_ACCESS_KEY_ID");
  restoreEnvValue("S3_SECRET_ACCESS_KEY");
  mockCreateS3Client.mockClear();
  vi.resetModules();
});

describe("storage config", () => {
  it("uses the configured bucket", async () => {
    const { storageBucket, storageClient } = await loadStorage();

    expect(storageBucket).toBe(process.env.S3_BUCKET);
    expect(storageClient).toEqual({
      config: expect.objectContaining({ bucket: process.env.S3_BUCKET })
    });
  });

  it("handles missing endpoints", async () => {
    delete process.env.S3_ENDPOINT;

    const { storageClient } = await loadStorage();

    expect(storageClient).toEqual({
      config: expect.objectContaining({
        endpoint: undefined,
        region: process.env.S3_REGION
      })
    });
  });

  it("normalizes website endpoints", async () => {
    process.env.S3_ENDPOINT = "https://s3-website.us-west-2.amazonaws.com";
    process.env.S3_REGION = "us-east-1";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { storageClient } = await loadStorage();

    expect(storageClient).toEqual({
      config: expect.objectContaining({
        endpoint: "https://s3.us-west-2.amazonaws.com",
        region: "us-east-1"
      })
    });
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("drops explicit AWS endpoints to let the SDK derive them", async () => {
    process.env.S3_ENDPOINT = "https://s3.us-east-1.amazonaws.com";
    process.env.S3_REGION = "us-east-1";

    const { storageClient } = await loadStorage();

    expect(storageClient).toEqual({
      config: expect.objectContaining({
        endpoint: undefined,
        region: "us-east-1"
      })
    });
  });

  it("normalizes mismatched AWS regions", async () => {
    process.env.S3_ENDPOINT = "https://s3.us-west-2.amazonaws.com";
    process.env.S3_REGION = "us-east-1";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { storageClient } = await loadStorage();

    expect(storageClient).toEqual({
      config: expect.objectContaining({
        endpoint: undefined,
        region: "us-west-2"
      })
    });
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("honors path style configuration", async () => {
    process.env.S3_FORCE_PATH_STYLE = "true";

    const { storageClient } = await loadStorage();

    expect(storageClient).toEqual({
      config: expect.objectContaining({ forcePathStyle: true })
    });
  });

  it("passes through session tokens", async () => {
    process.env.S3_SESSION_TOKEN = "session-token";

    const { storageClient } = await loadStorage();

    expect(storageClient).toEqual({
      config: expect.objectContaining({ sessionToken: "session-token" })
    });
  });
});
