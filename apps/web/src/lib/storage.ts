import "server-only";
import { createS3Client, type StorageConfig } from "@tally/storage";
import { env } from "./env";

const storageConfig: StorageConfig = {
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  bucket: env.S3_BUCKET,
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  forcePathStyle: env.S3_FORCE_PATH_STYLE === "true"
};

export const storageClient = createS3Client(storageConfig);
export const storageBucket = storageConfig.bucket;
