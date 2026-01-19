-- Update import parse status enum to match hardening pipeline
CREATE TYPE "ImportParseStatus_new" AS ENUM (
  'UPLOADED',
  'PARSING',
  'PARSED',
  'MAPPED',
  'READY',
  'ERROR'
);

ALTER TABLE "Import"
  ALTER COLUMN "parseStatus" DROP DEFAULT,
  ALTER COLUMN "parseStatus" TYPE "ImportParseStatus_new"
  USING (
    CASE "parseStatus"
      WHEN 'PENDING' THEN 'UPLOADED'::"ImportParseStatus_new"
      WHEN 'PARSED' THEN 'PARSED'::"ImportParseStatus_new"
      WHEN 'FAILED' THEN 'ERROR'::"ImportParseStatus_new"
      ELSE 'UPLOADED'::"ImportParseStatus_new"
    END
  );

DROP TYPE "ImportParseStatus";
ALTER TYPE "ImportParseStatus_new" RENAME TO "ImportParseStatus";
ALTER TABLE "Import" ALTER COLUMN "parseStatus" SET DEFAULT 'UPLOADED';

-- Add RUNNING to reconciliation status
ALTER TYPE "ReconciliationStatus" ADD VALUE IF NOT EXISTS 'RUNNING';
