import "server-only";
import { createS3Client, type StorageConfig } from "@tally/storage";
import { env } from "./env";

const normalizeS3Endpoint = (endpoint: string, region: string) => {
  let normalizedEndpoint = endpoint;
  let normalizedRegion = region;

  try {
    const url = new URL(endpoint);
    const host = url.host;

    // If the endpoint is an S3 website endpoint, convert to API endpoint
    if (host.includes("s3-website")) {
      normalizedEndpoint = endpoint.replace("s3-website", "s3");
      console.warn(
        "[storage] S3 endpoint is a website endpoint; using API endpoint instead."
      );
    }

    // If the endpoint contains an AWS region, prefer that to avoid signature mismatch
    const regionMatch = host.match(/s3[.-]([a-z0-9-]+)\.amazonaws\.com/);
    if (regionMatch && regionMatch[1] && regionMatch[1] !== region) {
      normalizedRegion = regionMatch[1];
      console.warn(
        `[storage] S3 region mismatch: env=${region}, endpoint=${regionMatch[1]}. Using endpoint region.`
      );
    }
  } catch (error) {
    // If parsing fails, keep the original values
  }

  return { endpoint: normalizedEndpoint, region: normalizedRegion };
};

const normalized = normalizeS3Endpoint(env.S3_ENDPOINT, env.S3_REGION);

const storageConfig: StorageConfig = {
  endpoint: normalized.endpoint,
  region: normalized.region,
  bucket: env.S3_BUCKET,
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  sessionToken: env.S3_SESSION_TOKEN,
  forcePathStyle: env.S3_FORCE_PATH_STYLE === "true"
};

export const storageClient = createS3Client(storageConfig);
export const storageBucket = storageConfig.bucket;

const safeKeySuffix = env.S3_ACCESS_KEY_ID.slice(-4);
console.warn(
  `[storage] S3 config: bucket=${env.S3_BUCKET}, region=${normalized.region}, endpoint=${normalized.endpoint}, pathStyle=${env.S3_FORCE_PATH_STYLE}, keySuffix=****${safeKeySuffix}${env.S3_SESSION_TOKEN ? ", sessionToken=present" : ""}`
);
