CREATE TABLE "NormalizedDataset" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "firmId" UUID NOT NULL,
  "importId" UUID NOT NULL,
  "sourceType" "SourceType" NOT NULL,
  "mappingTemplateVersionId" UUID,
  "normalizationVersion" TEXT NOT NULL,
  "headerRowIndex" INTEGER NOT NULL,
  "headerRow" JSONB NOT NULL,
  "rowCount" INTEGER NOT NULL,
  "rows" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "NormalizedDataset"
  ADD CONSTRAINT "NormalizedDataset_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "Firm"("id")
  ON DELETE RESTRICT;

ALTER TABLE "NormalizedDataset"
  ADD CONSTRAINT "NormalizedDataset_importId_fkey"
  FOREIGN KEY ("importId") REFERENCES "Import"("id")
  ON DELETE RESTRICT;

ALTER TABLE "NormalizedDataset"
  ADD CONSTRAINT "NormalizedDataset_mappingTemplateVersionId_fkey"
  FOREIGN KEY ("mappingTemplateVersionId") REFERENCES "MappingTemplate"("id")
  ON DELETE SET NULL;

CREATE UNIQUE INDEX "NormalizedDataset_importId_key" ON "NormalizedDataset"("importId");
CREATE INDEX "NormalizedDataset_firmId_idx" ON "NormalizedDataset"("firmId");
CREATE INDEX "NormalizedDataset_importId_idx" ON "NormalizedDataset"("importId");
CREATE INDEX "NormalizedDataset_mappingTemplateVersionId_idx" ON "NormalizedDataset"("mappingTemplateVersionId");

ALTER TABLE "Import" DROP CONSTRAINT IF EXISTS "Import_normalizedDatasetId_fkey";
DROP INDEX IF EXISTS "Import_normalizedDatasetId_idx";
ALTER TABLE "Import" DROP COLUMN IF EXISTS "normalizedDatasetId";
