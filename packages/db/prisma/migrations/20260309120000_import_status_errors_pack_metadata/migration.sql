-- Import status enum and error metadata
CREATE TYPE "ImportStatus" AS ENUM (
  'UPLOADED',
  'PARSING',
  'PARSED',
  'MAPPING_REQUIRED',
  'MAPPED',
  'READY',
  'ERROR_FILE_INVALID',
  'ERROR_PARSE_FAILED'
);

ALTER TABLE "Import"
  ALTER COLUMN "parseStatus" DROP DEFAULT,
  ALTER COLUMN "parseStatus" TYPE "ImportStatus"
  USING (
    CASE "parseStatus"
      WHEN 'UPLOADED' THEN 'UPLOADED'::"ImportStatus"
      WHEN 'PARSING' THEN 'PARSING'::"ImportStatus"
      WHEN 'PARSED' THEN 'PARSED'::"ImportStatus"
      WHEN 'MAPPED' THEN 'MAPPED'::"ImportStatus"
      WHEN 'READY' THEN 'READY'::"ImportStatus"
      WHEN 'ERROR' THEN 'ERROR_PARSE_FAILED'::"ImportStatus"
      ELSE 'UPLOADED'::"ImportStatus"
    END
  );

DROP TYPE "ImportParseStatus";
ALTER TABLE "Import" ALTER COLUMN "parseStatus" SET DEFAULT 'UPLOADED';

CREATE TYPE "ImportErrorCode" AS ENUM (
  'ERROR_FILE_INVALID',
  'ERROR_PARSE_FAILED'
);

ALTER TABLE "Import"
  ADD COLUMN "errorCode" "ImportErrorCode",
  ADD COLUMN "errorMessage" TEXT;

-- Pack metadata fields
ALTER TABLE "Pack"
  ADD COLUMN "storageKeyPdf" TEXT,
  ADD COLUMN "contentType" TEXT,
  ADD COLUMN "sizeBytes" INTEGER,
  ADD COLUMN "fileHashSha256" TEXT;

-- Audit actions for pack download
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PACK_DOWNLOADED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PACK_DOWNLOAD_FAILED';
