import "server-only";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(32),
  APP_BASE_URL: z.string().url(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string(),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_SESSION_TOKEN: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional()
});

export const env = envSchema.parse(process.env);
