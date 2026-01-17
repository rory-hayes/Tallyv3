-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('REGISTER', 'BANK', 'GL', 'STATUTORY');

-- CreateEnum
CREATE TYPE "ImportParseStatus" AS ENUM ('PENDING', 'PARSED', 'FAILED');

-- CreateTable
CREATE TABLE "Import" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "payRunId" UUID NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "version" INTEGER NOT NULL,
    "storageUri" TEXT NOT NULL,
    "fileHashSha256" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedByUserId" UUID NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parseStatus" "ImportParseStatus" NOT NULL DEFAULT 'PENDING',
    "mappingTemplateVersionId" UUID,
    "normalizedDatasetId" UUID,
    "parseSummary" JSONB,

    CONSTRAINT "Import_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Import_firmId_idx" ON "Import"("firmId");

-- CreateIndex
CREATE INDEX "Import_clientId_idx" ON "Import"("clientId");

-- CreateIndex
CREATE INDEX "Import_payRunId_idx" ON "Import"("payRunId");

-- CreateIndex
CREATE INDEX "Import_uploadedByUserId_idx" ON "Import"("uploadedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Import_payRunId_sourceType_version_key" ON "Import"("payRunId", "sourceType", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Import_payRunId_sourceType_fileHashSha256_key" ON "Import"("payRunId", "sourceType", "fileHashSha256");

-- AddForeignKey
ALTER TABLE "Import" ADD CONSTRAINT "Import_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Import" ADD CONSTRAINT "Import_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Import" ADD CONSTRAINT "Import_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "PayRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Import" ADD CONSTRAINT "Import_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
