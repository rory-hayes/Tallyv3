-- Account classification mapping (hotfix)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountClass') THEN
    CREATE TYPE "AccountClass" AS ENUM (
      'EXPENSE',
      'NET_PAYABLE',
      'TAX_PAYABLE',
      'NI_PRSI_PAYABLE',
      'PENSION_PAYABLE',
      'CASH',
      'OTHER'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "AccountClassification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "firmId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "accountCode" TEXT NOT NULL,
  "accountName" TEXT,
  "classification" "AccountClass" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountClassification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountClassification_firmId_fkey"
    FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccountClassification_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccountClassification_clientId_accountCode_key"
  ON "AccountClassification"("clientId", "accountCode");

CREATE INDEX IF NOT EXISTS "AccountClassification_firmId_clientId_idx"
  ON "AccountClassification"("firmId", "clientId");
