-- AlterTable: Add missing BankGuarantee columns if table was created before organizationId was added
ALTER TABLE "BankGuarantee" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "BankGuarantee" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "BankGuarantee" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'NPR';
ALTER TABLE "BankGuarantee" ADD COLUMN IF NOT EXISTS "issuedMiti" TEXT;
ALTER TABLE "BankGuarantee" ADD COLUMN IF NOT EXISTS "expiryMiti" TEXT;
ALTER TABLE "BankGuarantee" ADD COLUMN IF NOT EXISTS "claimPeriodDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "BankGuarantee" ADD COLUMN IF NOT EXISTS "claimExpiryDate" TIMESTAMP(3);
ALTER TABLE "BankGuarantee" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "BankGuarantee" ADD COLUMN IF NOT EXISTS "purpose" TEXT;
ALTER TABLE "BankGuarantee" ADD COLUMN IF NOT EXISTS "marginAmount" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "BankGuarantee" ADD COLUMN IF NOT EXISTS "commissionRate" DECIMAL(15,4) NOT NULL DEFAULT 0;
ALTER TABLE "BankGuarantee" ADD COLUMN IF NOT EXISTS "commissionPaid" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "BankGuarantee" ADD COLUMN IF NOT EXISTS "documentUrl" TEXT;
ALTER TABLE "BankGuarantee" ADD COLUMN IF NOT EXISTS "documentName" TEXT;
ALTER TABLE "BankGuarantee" ADD COLUMN IF NOT EXISTS "amendments" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "BankGuarantee" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- Foreign Keys
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BankGuarantee_organizationId_fkey'
  ) THEN 
    ALTER TABLE "BankGuarantee" 
    ADD CONSTRAINT "BankGuarantee_organizationId_fkey" 
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BankGuarantee_projectId_fkey'
  ) THEN 
    ALTER TABLE "BankGuarantee" 
    ADD CONSTRAINT "BankGuarantee_projectId_fkey" 
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "BankGuarantee_organizationId_status_expiryDate_idx" ON "BankGuarantee"("organizationId", "status", "expiryDate");
CREATE INDEX IF NOT EXISTS "BankGuarantee_projectId_status_expiryDate_idx" ON "BankGuarantee"("projectId", "status", "expiryDate");
