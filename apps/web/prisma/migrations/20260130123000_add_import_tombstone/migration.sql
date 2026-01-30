ALTER TABLE "Import" ADD COLUMN "deletedAt" TIMESTAMPTZ;
ALTER TABLE "Import" ADD COLUMN "deletedByUserId" UUID;

ALTER TABLE "Import"
  ADD CONSTRAINT "Import_deletedByUserId_fkey"
  FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL;

CREATE INDEX "Import_deletedAt_idx" ON "Import"("deletedAt");
