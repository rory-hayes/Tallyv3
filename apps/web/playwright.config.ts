import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const defaultPort = process.env.E2E_PORT ?? "3010";
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${defaultPort}`;
const shouldStartServer = !process.env.PLAYWRIGHT_BASE_URL;
const resolvedPort = new URL(baseURL).port || defaultPort;
const serverUrl =
  process.env.PLAYWRIGHT_SERVER_URL ?? `${baseURL.replace(/\/$/, "")}/login`;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://tally:tally@localhost:5434/tally";
const sessionSecret =
  process.env.SESSION_SECRET ?? "dev-session-secret-32-characters!!";
const appBaseUrl = process.env.APP_BASE_URL ?? baseURL;
const s3Region = process.env.S3_REGION ?? "us-east-1";
const s3Bucket = process.env.S3_BUCKET ?? "tally-dev";
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID ?? "minioadmin";
const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin";
const s3Endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
const s3ForcePathStyle = process.env.S3_FORCE_PATH_STYLE ?? "true";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: true,
  retries: isCI ? 2 : 0,
  reporter: isCI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "on-failure" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: shouldStartServer
    ? {
        command: "pnpm dev",
        url: serverUrl,
        reuseExistingServer: !isCI,
        timeout: 120_000,
        env: {
          ...process.env,
          PORT: resolvedPort,
          DATABASE_URL: databaseUrl,
          SESSION_SECRET: sessionSecret,
          APP_BASE_URL: appBaseUrl,
          JOBS_INLINE: "true",
          S3_REGION: s3Region,
          S3_BUCKET: s3Bucket,
          S3_ACCESS_KEY_ID: s3AccessKeyId,
          S3_SECRET_ACCESS_KEY: s3SecretAccessKey,
          S3_ENDPOINT: s3Endpoint,
          S3_FORCE_PATH_STYLE: s3ForcePathStyle
        }
      }
    : undefined,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
