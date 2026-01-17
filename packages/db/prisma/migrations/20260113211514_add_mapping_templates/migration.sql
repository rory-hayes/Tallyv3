-- CreateEnum
CREATE TYPE "MappingTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED');

-- CreateTable
CREATE TABLE "MappingTemplate" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "clientId" UUID,
    "sourceType" "SourceType" NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "MappingTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceColumns" JSONB NOT NULL,
    "columnMap" JSONB NOT NULL,
    "normalizationRules" JSONB,
    "headerRowIndex" INTEGER,
    "sheetName" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MappingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MappingTemplate_firmId_clientId_sourceType_idx" ON "MappingTemplate"("firmId", "clientId", "sourceType");

-- CreateIndex
CREATE INDEX "MappingTemplate_createdByUserId_idx" ON "MappingTemplate"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "MappingTemplate_firmId_clientId_sourceType_name_version_key" ON "MappingTemplate"("firmId", "clientId", "sourceType", "name", "version");

-- AddForeignKey
ALTER TABLE "Import" ADD CONSTRAINT "Import_mappingTemplateVersionId_fkey" FOREIGN KEY ("mappingTemplateVersionId") REFERENCES "MappingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MappingTemplate" ADD CONSTRAINT "MappingTemplate_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MappingTemplate" ADD CONSTRAINT "MappingTemplate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MappingTemplate" ADD CONSTRAINT "MappingTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
