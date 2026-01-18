-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('PASS', 'WARN', 'FAIL');

-- CreateEnum
CREATE TYPE "CheckSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CheckType" AS ENUM ('CHK_REGISTER_NET_TO_BANK_TOTAL', 'CHK_JOURNAL_DEBITS_EQUAL_CREDITS');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "ExceptionCategory" AS ENUM ('BANK_MISMATCH', 'JOURNAL_MISMATCH', 'STATUTORY_MISMATCH', 'SANITY');

-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "payRunId" UUID NOT NULL,
    "runNumber" INTEGER NOT NULL,
    "bundleId" TEXT NOT NULL,
    "bundleVersion" TEXT NOT NULL,
    "status" "ReconciliationStatus" NOT NULL,
    "inputSummary" JSONB NOT NULL,
    "executedByUserId" UUID,
    "supersededAt" TIMESTAMP(3),
    "supersededByRunId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckResult" (
    "id" UUID NOT NULL,
    "reconciliationRunId" UUID NOT NULL,
    "checkType" "CheckType" NOT NULL,
    "checkVersion" TEXT NOT NULL,
    "status" "CheckStatus" NOT NULL,
    "severity" "CheckSeverity" NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exception" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "payRunId" UUID NOT NULL,
    "reconciliationRunId" UUID NOT NULL,
    "checkResultId" UUID NOT NULL,
    "category" "ExceptionCategory" NOT NULL,
    "severity" "CheckSeverity" NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "supersededAt" TIMESTAMP(3),
    "supersededByRunId" UUID,
    "assignedToUserId" UUID,
    "resolutionNote" TEXT,
    "resolutionAttachmentUri" TEXT,
    "resolvedByUserId" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exception_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationRun_payRunId_runNumber_key" ON "ReconciliationRun"("payRunId", "runNumber");

-- CreateIndex
CREATE INDEX "ReconciliationRun_firmId_payRunId_idx" ON "ReconciliationRun"("firmId", "payRunId");

-- CreateIndex
CREATE INDEX "ReconciliationRun_supersededByRunId_idx" ON "ReconciliationRun"("supersededByRunId");

-- CreateIndex
CREATE INDEX "CheckResult_reconciliationRunId_idx" ON "CheckResult"("reconciliationRunId");

-- CreateIndex
CREATE INDEX "CheckResult_checkType_idx" ON "CheckResult"("checkType");

-- CreateIndex
CREATE UNIQUE INDEX "Exception_checkResultId_key" ON "Exception"("checkResultId");

-- CreateIndex
CREATE INDEX "Exception_firmId_payRunId_idx" ON "Exception"("firmId", "payRunId");

-- CreateIndex
CREATE INDEX "Exception_reconciliationRunId_idx" ON "Exception"("reconciliationRunId");

-- CreateIndex
CREATE INDEX "Exception_supersededByRunId_idx" ON "Exception"("supersededByRunId");

-- AddForeignKey
ALTER TABLE "ReconciliationRun" ADD CONSTRAINT "ReconciliationRun_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationRun" ADD CONSTRAINT "ReconciliationRun_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "PayRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationRun" ADD CONSTRAINT "ReconciliationRun_executedByUserId_fkey" FOREIGN KEY ("executedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationRun" ADD CONSTRAINT "ReconciliationRun_supersededByRunId_fkey" FOREIGN KEY ("supersededByRunId") REFERENCES "ReconciliationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckResult" ADD CONSTRAINT "CheckResult_reconciliationRunId_fkey" FOREIGN KEY ("reconciliationRunId") REFERENCES "ReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "PayRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_reconciliationRunId_fkey" FOREIGN KEY ("reconciliationRunId") REFERENCES "ReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_checkResultId_fkey" FOREIGN KEY ("checkResultId") REFERENCES "CheckResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
