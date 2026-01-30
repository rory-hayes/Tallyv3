CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "JobType" AS ENUM (
  'IMPORT_PARSE',
  'IMPORT_NORMALIZE',
  'RECONCILIATION_RUN',
  'PACK_GENERATE'
);

CREATE TABLE "Job" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" UUID REFERENCES "Firm"("id") ON DELETE SET NULL,
  "type" "JobType" NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
  "payload" JSONB NOT NULL,
  "runAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "lockedAt" TIMESTAMPTZ,
  "lockedBy" TEXT,
  "lastError" TEXT,
  "payRunId" UUID,
  "importId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");
CREATE INDEX "Job_firmId_idx" ON "Job"("firmId");
CREATE INDEX "Job_payRunId_idx" ON "Job"("payRunId");
CREATE INDEX "Job_importId_idx" ON "Job"("importId");
