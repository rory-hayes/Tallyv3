-- CreateEnum
CREATE TYPE "ExpectedVarianceType" AS ENUM ('DIRECTORS_SEPARATE', 'PENSION_SEPARATE', 'ROUNDING', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'TOLERANCE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'APPROVAL_SETTINGS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'EXPECTED_VARIANCE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'EXPECTED_VARIANCE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'EXPECTED_VARIANCE_ARCHIVED';

-- DropForeignKey
ALTER TABLE "AccountClassification" DROP CONSTRAINT "AccountClassification_clientId_fkey";

-- DropForeignKey
ALTER TABLE "AccountClassification" DROP CONSTRAINT "AccountClassification_firmId_fkey";

-- AlterTable
ALTER TABLE "AccountClassification" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "settings" JSONB;

-- AlterTable
ALTER TABLE "PayRun" ADD COLUMN     "settings" JSONB;

-- CreateTable
CREATE TABLE "ExpectedVariance" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "checkType" "CheckType",
    "varianceType" "ExpectedVarianceType" NOT NULL,
    "condition" JSONB,
    "effect" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" UUID NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpectedVariance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpectedVariance_firmId_clientId_idx" ON "ExpectedVariance"("firmId", "clientId");

-- AddForeignKey
ALTER TABLE "AccountClassification" ADD CONSTRAINT "AccountClassification_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountClassification" ADD CONSTRAINT "AccountClassification_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpectedVariance" ADD CONSTRAINT "ExpectedVariance_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpectedVariance" ADD CONSTRAINT "ExpectedVariance_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpectedVariance" ADD CONSTRAINT "ExpectedVariance_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
