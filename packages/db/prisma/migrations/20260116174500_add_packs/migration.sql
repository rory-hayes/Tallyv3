-- CreateTable
CREATE TABLE "Pack" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "payRunId" UUID NOT NULL,
    "reconciliationRunId" UUID NOT NULL,
    "packVersion" INTEGER NOT NULL,
    "storageUriPdf" TEXT NOT NULL,
    "storageUriBundle" TEXT,
    "metadata" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedByUserId" UUID NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "lockedByUserId" UUID,

    CONSTRAINT "Pack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pack_payRunId_packVersion_key" ON "Pack"("payRunId", "packVersion");

-- CreateIndex
CREATE INDEX "Pack_firmId_payRunId_idx" ON "Pack"("firmId", "payRunId");

-- CreateIndex
CREATE INDEX "Pack_reconciliationRunId_idx" ON "Pack"("reconciliationRunId");

-- CreateIndex
CREATE INDEX "Pack_generatedByUserId_idx" ON "Pack"("generatedByUserId");

-- CreateIndex
CREATE INDEX "Pack_lockedByUserId_idx" ON "Pack"("lockedByUserId");

-- AddForeignKey
ALTER TABLE "Pack" ADD CONSTRAINT "Pack_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pack" ADD CONSTRAINT "Pack_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "PayRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pack" ADD CONSTRAINT "Pack_reconciliationRunId_fkey" FOREIGN KEY ("reconciliationRunId") REFERENCES "ReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pack" ADD CONSTRAINT "Pack_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pack" ADD CONSTRAINT "Pack_lockedByUserId_fkey" FOREIGN KEY ("lockedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
