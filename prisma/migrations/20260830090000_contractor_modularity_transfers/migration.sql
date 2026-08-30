-- ═══════════════════════════════════════════════════════════════════════════
-- Contractor Modularity Presets, Tax Entities, & Inter-Site Transfers
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterTable: Project
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "operationalPreset" TEXT NOT NULL DEFAULT 'record_keeper';

-- AlterTable: MaterialTransaction
ALTER TABLE "MaterialTransaction" ADD COLUMN IF NOT EXISTS "billedToEntity" TEXT NOT NULL DEFAULT 'primary_org';
ALTER TABLE "MaterialTransaction" ADD COLUMN IF NOT EXISTS "recipientPan" TEXT;

-- AlterTable: VatBill
ALTER TABLE "VatBill" ADD COLUMN IF NOT EXISTS "billedToEntity" TEXT NOT NULL DEFAULT 'primary_org';
ALTER TABLE "VatBill" ADD COLUMN IF NOT EXISTS "recipientPan" TEXT;

-- AlterTable: VendorBill
ALTER TABLE "VendorBill" ADD COLUMN IF NOT EXISTS "billedToEntity" TEXT NOT NULL DEFAULT 'primary_org';
ALTER TABLE "VendorBill" ADD COLUMN IF NOT EXISTS "recipientPan" TEXT;

-- CreateTable: InterSiteTransfer
CREATE TABLE IF NOT EXISTS "InterSiteTransfer" (
    "id" TEXT NOT NULL,
    "transferNo" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "originProjectId" TEXT NOT NULL,
    "destinationProjectId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "transferRate" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "originStoreLocationId" TEXT,
    "destinationStoreLocationId" TEXT,
    "isInstantTransfer" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'received',
    "dispatchDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchMiti" TEXT,
    "dispatchedById" TEXT,
    "vehicleNo" TEXT,
    "driverName" TEXT,
    "chalanNo" TEXT,
    "receivedDate" TIMESTAMP(3),
    "receivedMiti" TEXT,
    "receivedById" TEXT,
    "receivedQty" DECIMAL(15,4),
    "damageLossQty" DECIMAL(15,4) DEFAULT 0,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterSiteTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EquipmentTransfer
CREATE TABLE IF NOT EXISTS "EquipmentTransfer" (
    "id" TEXT NOT NULL,
    "transferNo" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "originProjectId" TEXT NOT NULL,
    "destinationProjectId" TEXT NOT NULL,
    "transferDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transferMiti" TEXT,
    "chalanNo" TEXT,
    "vehicleNo" TEXT,
    "driverName" TEXT,
    "transporterName" TEXT,
    "meterAtDispatch" DECIMAL(15,2),
    "meterAtReceive" DECIMAL(15,2),
    "freightCost" DECIMAL(15,2) DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "dispatchedById" TEXT,
    "receivedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: InterSiteTransfer
CREATE INDEX IF NOT EXISTS "InterSiteTransfer_organizationId_createdAt_idx" ON "InterSiteTransfer"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "InterSiteTransfer_originProjectId_idx" ON "InterSiteTransfer"("originProjectId");
CREATE INDEX IF NOT EXISTS "InterSiteTransfer_destinationProjectId_idx" ON "InterSiteTransfer"("destinationProjectId");
CREATE INDEX IF NOT EXISTS "InterSiteTransfer_materialId_idx" ON "InterSiteTransfer"("materialId");
CREATE INDEX IF NOT EXISTS "InterSiteTransfer_status_idx" ON "InterSiteTransfer"("status");

-- CreateIndex: EquipmentTransfer
CREATE INDEX IF NOT EXISTS "EquipmentTransfer_organizationId_createdAt_idx" ON "EquipmentTransfer"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "EquipmentTransfer_equipmentId_idx" ON "EquipmentTransfer"("equipmentId");
CREATE INDEX IF NOT EXISTS "EquipmentTransfer_originProjectId_idx" ON "EquipmentTransfer"("originProjectId");
CREATE INDEX IF NOT EXISTS "EquipmentTransfer_destinationProjectId_idx" ON "EquipmentTransfer"("destinationProjectId");
CREATE INDEX IF NOT EXISTS "EquipmentTransfer_status_idx" ON "EquipmentTransfer"("status");

-- AddForeignKey: InterSiteTransfer
ALTER TABLE "InterSiteTransfer" DROP CONSTRAINT IF EXISTS "InterSiteTransfer_organizationId_fkey";
ALTER TABLE "InterSiteTransfer" ADD CONSTRAINT "InterSiteTransfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InterSiteTransfer" DROP CONSTRAINT IF EXISTS "InterSiteTransfer_originProjectId_fkey";
ALTER TABLE "InterSiteTransfer" ADD CONSTRAINT "InterSiteTransfer_originProjectId_fkey" FOREIGN KEY ("originProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InterSiteTransfer" DROP CONSTRAINT IF EXISTS "InterSiteTransfer_destinationProjectId_fkey";
ALTER TABLE "InterSiteTransfer" ADD CONSTRAINT "InterSiteTransfer_destinationProjectId_fkey" FOREIGN KEY ("destinationProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InterSiteTransfer" DROP CONSTRAINT IF EXISTS "InterSiteTransfer_materialId_fkey";
ALTER TABLE "InterSiteTransfer" ADD CONSTRAINT "InterSiteTransfer_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InterSiteTransfer" DROP CONSTRAINT IF EXISTS "InterSiteTransfer_originStoreLocationId_fkey";
ALTER TABLE "InterSiteTransfer" ADD CONSTRAINT "InterSiteTransfer_originStoreLocationId_fkey" FOREIGN KEY ("originStoreLocationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InterSiteTransfer" DROP CONSTRAINT IF EXISTS "InterSiteTransfer_destinationStoreLocationId_fkey";
ALTER TABLE "InterSiteTransfer" ADD CONSTRAINT "InterSiteTransfer_destinationStoreLocationId_fkey" FOREIGN KEY ("destinationStoreLocationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InterSiteTransfer" DROP CONSTRAINT IF EXISTS "InterSiteTransfer_dispatchedById_fkey";
ALTER TABLE "InterSiteTransfer" ADD CONSTRAINT "InterSiteTransfer_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InterSiteTransfer" DROP CONSTRAINT IF EXISTS "InterSiteTransfer_receivedById_fkey";
ALTER TABLE "InterSiteTransfer" ADD CONSTRAINT "InterSiteTransfer_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: EquipmentTransfer
ALTER TABLE "EquipmentTransfer" DROP CONSTRAINT IF EXISTS "EquipmentTransfer_organizationId_fkey";
ALTER TABLE "EquipmentTransfer" ADD CONSTRAINT "EquipmentTransfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EquipmentTransfer" DROP CONSTRAINT IF EXISTS "EquipmentTransfer_equipmentId_fkey";
ALTER TABLE "EquipmentTransfer" ADD CONSTRAINT "EquipmentTransfer_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EquipmentTransfer" DROP CONSTRAINT IF EXISTS "EquipmentTransfer_originProjectId_fkey";
ALTER TABLE "EquipmentTransfer" ADD CONSTRAINT "EquipmentTransfer_originProjectId_fkey" FOREIGN KEY ("originProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EquipmentTransfer" DROP CONSTRAINT IF EXISTS "EquipmentTransfer_destinationProjectId_fkey";
ALTER TABLE "EquipmentTransfer" ADD CONSTRAINT "EquipmentTransfer_destinationProjectId_fkey" FOREIGN KEY ("destinationProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EquipmentTransfer" DROP CONSTRAINT IF EXISTS "EquipmentTransfer_dispatchedById_fkey";
ALTER TABLE "EquipmentTransfer" ADD CONSTRAINT "EquipmentTransfer_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EquipmentTransfer" DROP CONSTRAINT IF EXISTS "EquipmentTransfer_receivedById_fkey";
ALTER TABLE "EquipmentTransfer" ADD CONSTRAINT "EquipmentTransfer_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── RLS for InterSiteTransfer & EquipmentTransfer ──
ALTER TABLE "InterSiteTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InterSiteTransfer" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inter_site_transfer_org_isolation" ON "InterSiteTransfer";
CREATE POLICY "inter_site_transfer_org_isolation" ON "InterSiteTransfer"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );

ALTER TABLE "EquipmentTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentTransfer" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipment_transfer_org_isolation" ON "EquipmentTransfer";
CREATE POLICY "equipment_transfer_org_isolation" ON "EquipmentTransfer"
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  )
  WITH CHECK (
    current_setting('app.is_superadmin', true) = 'true'
    OR "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text
  );
