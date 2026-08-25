-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LibraryPurpose" AS ENUM ('client_estimate', 'contractor_bid', 'contractor_actual');

-- CreateEnum
CREATE TYPE "BoqVersionStatus" AS ENUM ('draft', 'approved');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('material_supplier', 'equipment_vendor', 'both');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "logoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalMaterialCatalog" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "aliases" TEXT[],
    "category" TEXT,
    "subCategory" TEXT,
    "defaultUnit" TEXT,
    "defaultRate" DOUBLE PRECISION DEFAULT 0,
    "rateSource" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mergedIntoId" TEXT,
    "mergedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalMaterialCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMaterialEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "globalMaterialId" TEXT,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "localName" TEXT,
    "localUnit" TEXT,
    "localCategory" TEXT,
    "localSubCategory" TEXT,
    "localCode" TEXT,
    "defaultRate" DOUBLE PRECISION DEFAULT 0,
    "rateSource" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "mergedIntoId" TEXT,
    "mergedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgMaterialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCatalog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "aliases" TEXT[],
    "category" TEXT,
    "subCategory" TEXT,
    "defaultUnit" TEXT,
    "defaultRate" DOUBLE PRECISION DEFAULT 0,
    "rateSource" TEXT,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCatalog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'org',
    "sourceCatalogId" TEXT,
    "districts" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isBaseline" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCatalogItem" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "materialCatalogId" TEXT,
    "globalMaterialId" TEXT,
    "materialName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCatalogItemRate" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "RateCatalogItemRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRateColumn" (
    "id" TEXT NOT NULL,
    "rateCatalogId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "fiscalYear" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectRateColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRateColumnEntry" (
    "id" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "rateCatalogItemId" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectRateColumnEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgRateCatalog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentGlobalCatalogId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "rolledFromCatalogId" TEXT,
    "rollForwardFactor" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgRateCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgRateOverride" (
    "id" TEXT NOT NULL,
    "orgCatalogId" TEXT NOT NULL,
    "orgMaterialEntryId" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OrgRateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRateOverride" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "orgCatalogId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UncatalogedMaterial" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "organizationId" TEXT,
    "rawName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "unit" TEXT,
    "category" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceProjectId" TEXT,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mappedToId" TEXT,
    "suggestedMatchId" TEXT,
    "suggestedMatchScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UncatalogedMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialMergeLog" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "winnerId" TEXT NOT NULL,
    "loserId" TEXT NOT NULL,
    "mergedById" TEXT NOT NULL,
    "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "affectedTables" TEXT[],
    "totalRowsRemapped" INTEGER NOT NULL,
    "notes" TEXT,
    "isRolledBack" BOOLEAN NOT NULL DEFAULT false,
    "rolledBackAt" TIMESTAMP(3),
    "rolledBackById" TEXT,

    CONSTRAINT "MaterialMergeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateFiscalYearAudit" (
    "id" TEXT NOT NULL,
    "globalMaterialId" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "fromFiscalYear" TEXT NOT NULL,
    "toFiscalYear" TEXT NOT NULL,
    "fromRate" DOUBLE PRECISION NOT NULL,
    "toRate" DOUBLE PRECISION NOT NULL,
    "changePct" DOUBLE PRECISION NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateFiscalYearAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketRateRevisionLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "revisionType" TEXT NOT NULL,
    "fromFiscalYear" TEXT,
    "toFiscalYear" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loggedById" TEXT NOT NULL,
    "totalCostImpact" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "MarketRateRevisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketRateRevisionEntry" (
    "id" TEXT NOT NULL,
    "revisionLogId" TEXT NOT NULL,
    "materialName" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "oldMarketRate" DOUBLE PRECISION NOT NULL,
    "newMarketRate" DOUBLE PRECISION NOT NULL,
    "rateDelta" DOUBLE PRECISION NOT NULL,
    "estimatedRemainingQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costImpact" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "MarketRateRevisionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnrecognizedMaterial" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "unit" TEXT,
    "category" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstProjectId" TEXT,
    "firstUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnrecognizedMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "enabledGlobally" BOOLEAN NOT NULL DEFAULT true,
    "orgOverrides" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'engineer',
    "avatarUrl" TEXT,
    "organizationId" TEXT,
    "orgRole" TEXT NOT NULL DEFAULT 'member',
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "lastActiveAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedReason" TEXT,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "client" TEXT,
    "location" TEXT,
    "contractValue" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "boqLocked" BOOLEAN NOT NULL DEFAULT false,
    "skilledWageRate" DOUBLE PRECISION,
    "unskilledWageRate" DOUBLE PRECISION,
    "supervisorWageRate" DOUBLE PRECISION,
    "ownedEquipRate" DOUBLE PRECISION,
    "hiredEquipRate" DOUBLE PRECISION,
    "fuelPricePerLiter" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "costLibraryId" TEXT,
    "activeFiscalYear" TEXT,
    "rateLockDate" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rfi" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "ganttTaskId" TEXT,
    "boqItemId" TEXT,
    "drawingId" TEXT,
    "subcontractorId" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "discipline" TEXT,
    "workDate" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "inspectionStartTime" TIMESTAMP(3),
    "inspectionEndTime" TIMESTAMP(3),
    "pinX" DOUBLE PRECISION,
    "pinY" DOUBLE PRECISION,
    "costImpact" BOOLEAN NOT NULL DEFAULT false,
    "scheduleImpact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedToId" TEXT,

    CONSTRAINT "Rfi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfiItem" (
    "id" TEXT NOT NULL,
    "rfiId" TEXT NOT NULL,
    "boqItemId" TEXT,
    "boqCode" TEXT,
    "boqDesc" TEXT,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "paymentType" TEXT NOT NULL DEFAULT 'payable',
    "remark" TEXT,

    CONSTRAINT "RfiItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfiAttachment" (
    "id" TEXT NOT NULL,
    "rfiId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageUrl" TEXT NOT NULL DEFAULT '',
    "data" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfiAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfiComment" (
    "id" TEXT NOT NULL,
    "rfiId" TEXT NOT NULL,
    "parentId" TEXT,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RfiComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfiResponse" (
    "id" TEXT NOT NULL,
    "rfiId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'info',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfiResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "dayOfWeek" TEXT,
    "weatherMorning" TEXT,
    "weatherAfternoon" TEXT,
    "weatherEvening" TEXT,
    "maxTempC" DOUBLE PRECISION,
    "minTempC" DOUBLE PRECISION,
    "rainfallMm" DOUBLE PRECISION,
    "problems" TEXT,
    "safetyNotes" TEXT,
    "preparedById" TEXT,
    "checkedById" TEXT,
    "approvedById" TEXT,
    "preparedAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "remarks" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "clientApprovedAt" TIMESTAMP(3),
    "clientApprovedById" TEXT,
    "clientApprovalNote" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportAttachment" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageUrl" TEXT NOT NULL DEFAULT '',
    "data" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "takenAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReportAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportWorkforce" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL,
    "regHours" DOUBLE PRECISION NOT NULL,
    "otHours" DOUBLE PRECISION NOT NULL,
    "location" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyReportWorkforce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportProgress" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "rfiId" TEXT,
    "rfiItemId" TEXT,
    "ganttTaskId" TEXT,
    "boqItemId" TEXT,
    "boqCode" TEXT,
    "boqDesc" TEXT,
    "taskDescription" TEXT,
    "plannedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "batchedQty" DOUBLE PRECISION DEFAULT 0,
    "payableQty" DOUBLE PRECISION DEFAULT 0,
    "unit" TEXT,
    "paymentType" TEXT NOT NULL DEFAULT 'payable',
    "executionStatus" TEXT NOT NULL DEFAULT 'planned',
    "delayReason" TEXT,
    "delayNotes" TEXT,
    "isEotCandidate" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "remarks" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyReportProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportEquipment" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ownership" TEXT NOT NULL DEFAULT 'owned',
    "workingHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fuel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyReportEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportMaterial" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "supplier" TEXT,
    "vehicle" TEXT,
    "testStatus" TEXT NOT NULL DEFAULT 'none',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyReportMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportMaterialConsumed" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "materialId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyReportMaterialConsumed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportVisitor" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "visitor" TEXT NOT NULL,
    "organization" TEXT,
    "purpose" TEXT,
    "time" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyReportVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportMeeting" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "attendees" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyReportMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoqItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baselineQty" DOUBLE PRECISION,
    "baselineRate" DOUBLE PRECISION,
    "category" TEXT,
    "section" TEXT,
    "tags" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoqItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoqIngredient" (
    "id" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "rateAnalysisId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "calcMode" TEXT NOT NULL DEFAULT 'fixed',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT '',
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pctBase" TEXT NOT NULL DEFAULT '',
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "rateProfileItemId" TEXT,
    "materialId" TEXT,
    "materialCatalogId" TEXT,
    "globalMaterialId" TEXT,
    "rateCatalogItemId" TEXT,
    "rateDistrict" TEXT,
    "rateFiscalYear" TEXT,

    CONSTRAINT "BoqIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateAnalysis" (
    "id" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "libraryId" TEXT,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "batchSize" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisLibrary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" "LibraryPurpose" NOT NULL DEFAULT 'client_estimate',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "districtRateCatalogId" TEXT,
    "selectedFiscalYear" TEXT,
    "selectedDistrict" TEXT,
    "orgRateCatalogId" TEXT,
    "projectRateCatalogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoqVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "BoqVersionStatus" NOT NULL DEFAULT 'draft',
    "variationOrderId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoqVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoqVersionItem" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "baselineQty" DOUBLE PRECISION,
    "baselineRate" DOUBLE PRECISION,
    "previousQty" DOUBLE PRECISION,
    "previousRate" DOUBLE PRECISION,

    CONSTRAINT "BoqVersionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalPresetAnalysis" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'Custom',
    "category" TEXT NOT NULL DEFAULT 'General',
    "description" TEXT,
    "batchSize" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fiscalYear" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "sourcePresetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalPresetAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalPresetIngredient" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "calcMode" TEXT NOT NULL DEFAULT 'fixed',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT '',
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pctBase" TEXT NOT NULL DEFAULT '',
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "materialCatalogId" TEXT,
    "globalMaterialId" TEXT,

    CONSTRAINT "GlobalPresetIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'district_rate',
    "scope" TEXT NOT NULL DEFAULT 'project',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateProfileItem" (
    "id" TEXT NOT NULL,
    "rateProfileId" TEXT NOT NULL,
    "materialName" TEXT NOT NULL,
    "category" TEXT,
    "subCategory" TEXT,
    "unit" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "materialCatalogId" TEXT,
    "globalMaterialId" TEXT,

    CONSTRAINT "RateProfileItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GanttVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT,
    "description" TEXT,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "baseVersionId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scheduleType" TEXT NOT NULL DEFAULT 'PLANNING',
    "revisionOfId" TEXT,
    "revisionReason" TEXT,
    "revisionStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "approvalNote" TEXT,

    CONSTRAINT "GanttVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GanttTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT,
    "parentId" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "actualStartDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "duration" INTEGER NOT NULL DEFAULT 1,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "planningTaskId" TEXT,
    "baseProgress" DOUBLE PRECISION DEFAULT 0,
    "isProgressEdited" BOOLEAN NOT NULL DEFAULT false,
    "baseVersionId" TEXT,
    "plannedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "selectedCostLibraryId" TEXT,
    "laborCount" INTEGER NOT NULL DEFAULT 0,
    "assignees" TEXT,
    "dependencies" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isMilestone" BOOLEAN NOT NULL DEFAULT false,
    "workHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taskType" TEXT NOT NULL DEFAULT 'fixed_duration',
    "constraintType" TEXT NOT NULL DEFAULT 'asap',
    "constraintDate" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "notes" TEXT,
    "effortDriven" BOOLEAN NOT NULL DEFAULT false,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "ignoreResourceCalendar" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 500,
    "earnedValueMethod" TEXT NOT NULL DEFAULT 'percent_complete',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GanttTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceAssignment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "staffRoleId" TEXT,
    "staffId" TEXT,
    "equipmentId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'person',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "workHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "resourceType" TEXT NOT NULL DEFAULT 'work',
    "materialLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FS',
    "offset" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskBoqLink" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskBoqLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GanttTaskTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'custom',
    "description" TEXT,
    "data" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GanttTaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PartnerType" NOT NULL DEFAULT 'material_supplier',
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "pan" TEXT,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "code" TEXT,
    "regNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerSupply" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "materialCatalogId" TEXT,
    "globalMaterialId" TEXT,
    "materialName" TEXT NOT NULL,
    "brand" TEXT,
    "specType" TEXT,
    "unit" TEXT NOT NULL,
    "exFactoryRate" DOUBLE PRECISION NOT NULL,
    "transportRate" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerSupply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "category" TEXT,
    "subCategory" TEXT,
    "unit" TEXT NOT NULL,
    "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorderLevel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "materialCatalogId" TEXT,
    "orgMaterialEntryId" TEXT,
    "mergedIntoId" TEXT,
    "mergedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialTransaction" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reference" TEXT,
    "remarks" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "isDebitable" BOOLEAN NOT NULL DEFAULT false,
    "subcontractorId" TEXT,
    "recoveryRate" DOUBLE PRECISION,
    "paymentType" TEXT NOT NULL DEFAULT 'payable',
    "gateEntryId" TEXT,
    "vatPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tdsPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tdsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalWithVat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPayable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierInvoiceNo" TEXT,
    "supplierPan" TEXT,
    "storeLocationId" TEXT,
    "targetStoreLocationId" TEXT,
    "weighbridgeGross" DOUBLE PRECISION,
    "weighbridgeTare" DOUBLE PRECISION,
    "densityFactor" DOUBLE PRECISION,
    "purchaseOrderId" TEXT,
    "materialCatalogId" TEXT,

    CONSTRAINT "MaterialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "pan" TEXT,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT,
    "partnerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDate" TIMESTAMP(3),
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatPercent" DOUBLE PRECISION NOT NULL DEFAULT 13,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveryTerms" TEXT,
    "paymentTerms" TEXT,
    "remarks" TEXT,
    "requisitionId" TEXT,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "requisitionItemId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "receivedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "capacity" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'hrs',
    "status" TEXT NOT NULL DEFAULT 'active',
    "fuelRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "factoryFuelRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentLog" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "endHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fuelFilled" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workDescription" TEXT,
    "operator" TEXT,
    "ganttTaskId" TEXT,
    "boqItemId" TEXT,
    "outputQty" DOUBLE PRECISION,
    "outputUnit" TEXT,
    "tripCount" INTEGER,
    "logMode" TEXT NOT NULL DEFAULT 'meter',

    CONSTRAINT "EquipmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentMaintenance" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nextDueHours" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedDate" TIMESTAMP(3),
    "resolvedNotes" TEXT,

    CONSTRAINT "EquipmentMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentRental" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "partnerId" TEXT,
    "vendorId" TEXT,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "vendorName" TEXT,
    "vendorPhone" TEXT,
    "rentalType" TEXT NOT NULL DEFAULT 'daily',
    "rentalRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledEndDate" TIMESTAMP(3),
    "maintenanceBy" TEXT NOT NULL DEFAULT 'vendor',
    "maintenanceMinContractor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consumablesBy" TEXT NOT NULL DEFAULT 'vendor',
    "agreementFileData" TEXT,
    "agreementFileName" TEXT,
    "agreementFileType" TEXT,
    "storedFromDate" TIMESTAMP(3),
    "actualReturnDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "totalBillableDays" DOUBLE PRECISION,
    "totalRentalCost" DOUBLE PRECISION,
    "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentRental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentCrew" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "phone" TEXT,
    "salaryType" TEXT NOT NULL DEFAULT 'daily',
    "salaryRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salaryPaidBy" TEXT NOT NULL DEFAULT 'project',
    "allowanceType" TEXT NOT NULL DEFAULT 'daily',
    "allowanceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allowancePaidBy" TEXT NOT NULL DEFAULT 'project',
    "lodgingType" TEXT NOT NULL DEFAULT 'none',
    "lodgingRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lodgingPaidBy" TEXT NOT NULL DEFAULT 'project',
    "foodingType" TEXT NOT NULL DEFAULT 'none',
    "foodingRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "foodingPaidBy" TEXT NOT NULL DEFAULT 'project',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentCrew_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentVendor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "pan" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentDamage" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "damageType" TEXT NOT NULL DEFAULT 'normal_wear',
    "responsibleParty" TEXT NOT NULL DEFAULT 'contractor',
    "repairCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidBy" TEXT NOT NULL DEFAULT 'contractor',
    "contractorShare" DOUBLE PRECISION,
    "vendorShare" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'reported',
    "photoData" TEXT,
    "photoName" TEXT,
    "photoType" TEXT,
    "resolvedDate" TIMESTAMP(3),
    "resolvedNotes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentDamage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plant" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" TEXT NOT NULL DEFAULT 'concrete_batching',
    "makeModel" TEXT,
    "capacityValue" DOUBLE PRECISION,
    "capacityUnit" TEXT DEFAULT 'cum/hr',
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "equipmentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantMixDesign" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'concrete',
    "targetSlumpMm" DOUBLE PRECISION,
    "targetTempC" DOUBLE PRECISION,
    "waterCementRatio" DOUBLE PRECISION,
    "bitumenContentPct" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT 'cum',
    "status" TEXT NOT NULL DEFAULT 'approved',
    "boqItemId" TEXT,
    "ingredients" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantMixDesign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantBatchTicket" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "mixDesignId" TEXT,
    "ticketNumber" TEXT NOT NULL,
    "dispatchDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transitVehicleNo" TEXT NOT NULL,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "orderedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dispatchedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedQty" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT 'cum',
    "slumpMm" DOUBLE PRECISION,
    "temperatureC" DOUBLE PRECISION,
    "batchStartTime" TIMESTAMP(3),
    "batchEndTime" TIMESTAMP(3),
    "siteLocation" TEXT,
    "targetStructure" TEXT,
    "rfiId" TEXT,
    "dailyReportId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'dispatched',
    "rejectionReason" TEXT,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantBatchTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantSilo" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "materialType" TEXT NOT NULL,
    "capacity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'MT',
    "minAlertLevel" DOUBLE PRECISION,
    "lastDipDate" TIMESTAMP(3),
    "lastDipValue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantSilo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantDailyLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "logDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalBatches" INTEGER NOT NULL DEFAULT 0,
    "totalProduced" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'cum',
    "operatingHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "idleHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "breakdownHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "electricityUnitsKwh" DOUBLE PRECISION,
    "dieselLitres" DOUBLE PRECISION,
    "downtimeReason" TEXT,
    "operatorName" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantDailyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'general',
    "discipline" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "revision" TEXT NOT NULL DEFAULT 'A',
    "issuedDate" TIMESTAMP(3),
    "receivedFrom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRevision" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "issuedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "issuedBy" TEXT,

    CONSTRAINT "DocumentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transmittal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentTo" TEXT NOT NULL,
    "sentBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "remarks" TEXT,

    CONSTRAINT "Transmittal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransmittalItem" (
    "id" TEXT NOT NULL,
    "transmittalId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TransmittalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drawing" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discipline" TEXT,
    "status" TEXT NOT NULL DEFAULT 'current',
    "revision" TEXT NOT NULL DEFAULT 'A',
    "issuedDate" TIMESTAMP(3),
    "fileData" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "ganttTaskId" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'pending',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNotes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "drawingSetId" TEXT,

    CONSTRAINT "Drawing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingRevision" (
    "id" TEXT NOT NULL,
    "drawingId" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "issuedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "issuedBy" TEXT,
    "fileData" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'pending',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNotes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ipc" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "period" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "grossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retention" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advanceRecovery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPayable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatPercent" DOUBLE PRECISION NOT NULL DEFAULT 13,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tdsPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tdsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalWithVat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalPayable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "issueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "subcontractorId" TEXT,
    "boqVersionId" TEXT,

    CONSTRAINT "Ipc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpcItem" (
    "id" TEXT NOT NULL,
    "ipcId" TEXT NOT NULL,
    "boqCode" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "section" TEXT,
    "contractQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "previousQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "thisQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cumQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IpcItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "category" TEXT,
    "phone" TEXT,
    "dailyWage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "joinedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffRole" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'staff',
    "chainageFrom" DOUBLE PRECISION,
    "chainageTo" DOUBLE PRECISION,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "dailyWage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "skills" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffRoleAssignment" (
    "id" TEXT NOT NULL,
    "staffRoleId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAttendance" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "overtime" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "StaffAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyProgram" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "programDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyProgramTask" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "rfiId" TEXT,
    "rfiItemId" TEXT,
    "ganttTaskId" TEXT,
    "subcontractorId" TEXT,
    "taskName" TEXT NOT NULL,
    "location" TEXT,
    "boqItemId" TEXT,
    "boqCode" TEXT,
    "boqDesc" TEXT,
    "plannedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "paymentType" TEXT NOT NULL DEFAULT 'payable',
    "assignedTo" TEXT,
    "remarks" TEXT,
    "executionStatus" TEXT NOT NULL DEFAULT 'planned',
    "actualQty" DOUBLE PRECISION DEFAULT 0,
    "batchedQty" DOUBLE PRECISION DEFAULT 0,
    "payableQty" DOUBLE PRECISION DEFAULT 0,
    "delayReason" TEXT,
    "delayNotes" TEXT,
    "isEotCandidate" BOOLEAN NOT NULL DEFAULT false,
    "carriedOverFromId" TEXT,
    "cancellationStatus" TEXT NOT NULL DEFAULT 'none',
    "cancellationRequestedAt" TIMESTAMP(3),
    "cancellationRequestedBy" TEXT,
    "cancellationReason" TEXT,
    "cancellationRespondedAt" TIMESTAMP(3),
    "cancellationResponse" TEXT,
    "cancellationApprovedBy" TEXT,

    CONSTRAINT "DailyProgramTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "driverName" TEXT,
    "challanNo" TEXT,
    "description" TEXT,
    "estQty" DOUBLE PRECISION,
    "grossWeight" DOUBLE PRECISION,
    "tareWeight" DOUBLE PRECISION,
    "netWeight" DOUBLE PRECISION,
    "unit" TEXT,
    "fileUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcontractor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "pan" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "totalRetentionHeld" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRetentionReleased" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contractValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subcontractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariationOrder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "dateIssued" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateApproved" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariationOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariationOrderItem" (
    "id" TEXT NOT NULL,
    "variationOrderId" TEXT NOT NULL,
    "boqItemId" TEXT,
    "boqCode" TEXT NOT NULL,
    "boqDesc" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "previousQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "newQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "previousRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "newRate" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "VariationOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'user',
    "projectId" TEXT,
    "ownerId" TEXT,
    "organizationId" TEXT,
    "layout" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovedDocument" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedBy" TEXT,
    "signedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "pdfConfig" TEXT,

    CONSTRAINT "ApprovedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCost" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "description" TEXT,
    "boqItemId" TEXT,
    "ganttTaskId" TEXT,
    "subcontractorId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceRef" TEXT,
    "sourceRefId" TEXT,
    "vendor" TEXT,
    "paymentMode" TEXT,
    "receiptData" TEXT,
    "receiptFileType" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Correspondence" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'incoming',
    "theirRef" TEXT,
    "ourRef" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedDate" TIMESTAMP(3),
    "fromParty" TEXT,
    "fromName" TEXT,
    "toParty" TEXT,
    "toName" TEXT,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "letterType" TEXT NOT NULL DEFAULT 'informative',
    "repliesToId" TEXT,
    "ccList" TEXT,
    "actionAssignedTo" TEXT,
    "replyDraftedBy" TEXT,
    "replyDueDate" TIMESTAMP(3),
    "replyStatus" TEXT NOT NULL DEFAULT 'not_started',
    "replySentDate" TIMESTAMP(3),
    "replyOurRef" TEXT,
    "replyNotes" TEXT,
    "eotDaysClaimed" DOUBLE PRECISION,
    "eotDaysGranted" DOUBLE PRECISION,
    "eotStatus" TEXT,
    "eotLinkedTaskIds" TEXT,
    "fileData" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "replyFileData" TEXT,
    "replyFileName" TEXT,
    "replyFileType" TEXT,
    "linkedRfiId" TEXT,
    "linkedBoqItemId" TEXT,
    "linkedGanttTaskId" TEXT,
    "statusHistory" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Correspondence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingMarkup" (
    "id" TEXT NOT NULL,
    "drawingId" TEXT NOT NULL,
    "revisionId" TEXT,
    "type" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "w" DOUBLE PRECISION,
    "h" DOUBLE PRECISION,
    "rotation" DOUBLE PRECISION,
    "color" TEXT NOT NULL DEFAULT '#ef4444',
    "text" TEXT,
    "linkedItemId" TEXT,
    "linkedItemType" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingMarkup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingSet" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submittal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'shop_drawing',
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedDate" TIMESTAMP(3),
    "reviewedDate" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewComments" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "linkedBoqItemId" TEXT,
    "linkedGanttTaskId" TEXT,
    "linkedDrawingId" TEXT,
    "fileData" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "returnedFileData" TEXT,
    "returnedFileName" TEXT,
    "returnedFileType" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submittal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PunchItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "category" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'minor',
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedTo" TEXT,
    "dueDate" TIMESTAMP(3),
    "linkedBoqItemId" TEXT,
    "linkedGanttTaskId" TEXT,
    "linkedDrawingId" TEXT,
    "photoData" TEXT,
    "photoName" TEXT,
    "photoType" TEXT,
    "resolvedDate" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedNotes" TEXT,
    "verifiedDate" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PunchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatChannel" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'group',
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMember" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attachmentData" TEXT,
    "attachmentName" TEXT,
    "attachmentType" TEXT,
    "linkedEntityType" TEXT,
    "linkedEntityId" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatReadReceipt" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatReadReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "payeeType" TEXT NOT NULL,
    "payeeId" TEXT,
    "payeeName" TEXT NOT NULL,
    "ipcId" TEXT,
    "invoiceNumber" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "tdsDeducted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatIncluded" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMode" TEXT NOT NULL DEFAULT 'bank_transfer',
    "chequeNo" TEXT,
    "bankRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "retentionReleased" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyIncident" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL DEFAULT 'incident',
    "severity" TEXT NOT NULL DEFAULT 'minor',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "reportedBy" TEXT,
    "involvedPersons" TEXT,
    "actionTaken" TEXT,
    "rootCause" TEXT,
    "preventiveAction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'reported',
    "photoData" TEXT,
    "photoName" TEXT,
    "photoType" TEXT,
    "toolboxTopic" TEXT,
    "toolboxAttendees" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityInspection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "inspectionType" TEXT NOT NULL DEFAULT 'work_inspection',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "requestedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledDate" TIMESTAMP(3),
    "inspectedDate" TIMESTAMP(3),
    "inspectedBy" TEXT,
    "location" TEXT,
    "boqItemId" TEXT,
    "ganttTaskId" TEXT,
    "checklist" TEXT,
    "result" TEXT,
    "remarks" TEXT,
    "ncrNumber" TEXT,
    "photoData" TEXT,
    "photoName" TEXT,
    "photoType" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'site_coordination',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT,
    "attendees" TEXT,
    "agenda" TEXT,
    "minutes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingActionItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedTo" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "completedDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequisition" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "remarks" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,

    CONSTRAINT "PurchaseRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequisitionItem" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "selectedPartnerId" TEXT NOT NULL,
    "justification" TEXT,
    "fileUrl" TEXT,

    CONSTRAINT "PurchaseRequisitionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitionItemQuote" (
    "id" TEXT NOT NULL,
    "requisitionItemId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "exFactoryRate" DOUBLE PRECISION NOT NULL,
    "transportRate" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,

    CONSTRAINT "RequisitionItemQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreLocation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "address" TEXT,
    "incharge" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialStoreStock" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "storeLocationId" TEXT NOT NULL,
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialStoreStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorBill" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "billNumber" TEXT NOT NULL,
    "billDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "grossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tdsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPayable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'unpaid',
    "fileUrl" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorPayment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorBillId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" TEXT NOT NULL DEFAULT 'bank_transfer',
    "referenceNumber" TEXT,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");

-- CreateIndex
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalMaterialCatalog_code_key" ON "GlobalMaterialCatalog"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalMaterialCatalog_normalizedName_key" ON "GlobalMaterialCatalog"("normalizedName");

-- CreateIndex
CREATE INDEX "GlobalMaterialCatalog_category_idx" ON "GlobalMaterialCatalog"("category");

-- CreateIndex
CREATE INDEX "GlobalMaterialCatalog_normalizedName_idx" ON "GlobalMaterialCatalog"("normalizedName");

-- CreateIndex
CREATE INDEX "OrgMaterialEntry_organizationId_idx" ON "OrgMaterialEntry"("organizationId");

-- CreateIndex
CREATE INDEX "OrgMaterialEntry_globalMaterialId_idx" ON "OrgMaterialEntry"("globalMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMaterialEntry_organizationId_globalMaterialId_key" ON "OrgMaterialEntry"("organizationId", "globalMaterialId");

-- CreateIndex
CREATE INDEX "MaterialCatalog_organizationId_idx" ON "MaterialCatalog"("organizationId");

-- CreateIndex
CREATE INDEX "MaterialCatalog_isActive_idx" ON "MaterialCatalog"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCatalog_organizationId_normalizedName_key" ON "MaterialCatalog"("organizationId", "normalizedName");

-- CreateIndex
CREATE INDEX "RateCatalog_organizationId_idx" ON "RateCatalog"("organizationId");

-- CreateIndex
CREATE INDEX "RateCatalog_projectId_idx" ON "RateCatalog"("projectId");

-- CreateIndex
CREATE INDEX "RateCatalogItem_catalogId_idx" ON "RateCatalogItem"("catalogId");

-- CreateIndex
CREATE INDEX "RateCatalogItem_globalMaterialId_idx" ON "RateCatalogItem"("globalMaterialId");

-- CreateIndex
CREATE INDEX "RateCatalogItemRate_itemId_idx" ON "RateCatalogItemRate"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "RateCatalogItemRate_itemId_district_key" ON "RateCatalogItemRate"("itemId", "district");

-- CreateIndex
CREATE INDEX "ProjectRateColumn_rateCatalogId_idx" ON "ProjectRateColumn"("rateCatalogId");

-- CreateIndex
CREATE INDEX "ProjectRateColumn_projectId_idx" ON "ProjectRateColumn"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRateColumn_rateCatalogId_projectId_key" ON "ProjectRateColumn"("rateCatalogId", "projectId");

-- CreateIndex
CREATE INDEX "ProjectRateColumnEntry_columnId_idx" ON "ProjectRateColumnEntry"("columnId");

-- CreateIndex
CREATE INDEX "ProjectRateColumnEntry_rateCatalogItemId_idx" ON "ProjectRateColumnEntry"("rateCatalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRateColumnEntry_columnId_rateCatalogItemId_key" ON "ProjectRateColumnEntry"("columnId", "rateCatalogItemId");

-- CreateIndex
CREATE INDEX "OrgRateCatalog_organizationId_idx" ON "OrgRateCatalog"("organizationId");

-- CreateIndex
CREATE INDEX "OrgRateCatalog_parentGlobalCatalogId_idx" ON "OrgRateCatalog"("parentGlobalCatalogId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgRateCatalog_organizationId_fiscalYear_key" ON "OrgRateCatalog"("organizationId", "fiscalYear");

-- CreateIndex
CREATE INDEX "OrgRateOverride_orgCatalogId_idx" ON "OrgRateOverride"("orgCatalogId");

-- CreateIndex
CREATE INDEX "OrgRateOverride_orgMaterialEntryId_idx" ON "OrgRateOverride"("orgMaterialEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgRateOverride_orgCatalogId_orgMaterialEntryId_district_key" ON "OrgRateOverride"("orgCatalogId", "orgMaterialEntryId", "district");

-- CreateIndex
CREATE INDEX "ProjectRateOverride_projectId_idx" ON "ProjectRateOverride"("projectId");

-- CreateIndex
CREATE INDEX "ProjectRateOverride_orgCatalogId_idx" ON "ProjectRateOverride"("orgCatalogId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRateOverride_projectId_materialId_key" ON "ProjectRateOverride"("projectId", "materialId");

-- CreateIndex
CREATE INDEX "UncatalogedMaterial_organizationId_status_idx" ON "UncatalogedMaterial"("organizationId", "status");

-- CreateIndex
CREATE INDEX "UncatalogedMaterial_level_status_idx" ON "UncatalogedMaterial"("level", "status");

-- CreateIndex
CREATE INDEX "UncatalogedMaterial_normalizedName_idx" ON "UncatalogedMaterial"("normalizedName");

-- CreateIndex
CREATE INDEX "MaterialMergeLog_winnerId_idx" ON "MaterialMergeLog"("winnerId");

-- CreateIndex
CREATE INDEX "MaterialMergeLog_loserId_idx" ON "MaterialMergeLog"("loserId");

-- CreateIndex
CREATE INDEX "RateFiscalYearAudit_globalMaterialId_district_idx" ON "RateFiscalYearAudit"("globalMaterialId", "district");

-- CreateIndex
CREATE INDEX "RateFiscalYearAudit_fromFiscalYear_toFiscalYear_idx" ON "RateFiscalYearAudit"("fromFiscalYear", "toFiscalYear");

-- CreateIndex
CREATE INDEX "MarketRateRevisionLog_projectId_loggedAt_idx" ON "MarketRateRevisionLog"("projectId", "loggedAt");

-- CreateIndex
CREATE INDEX "MarketRateRevisionEntry_revisionLogId_idx" ON "MarketRateRevisionEntry"("revisionLogId");

-- CreateIndex
CREATE INDEX "UnrecognizedMaterial_organizationId_normalizedName_idx" ON "UnrecognizedMaterial"("organizationId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- CreateIndex
CREATE INDEX "FeatureFlag_key_idx" ON "FeatureFlag"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_createdById_idx" ON "Project"("createdById");

-- CreateIndex
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_code_key" ON "Project"("organizationId", "code");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "Rfi_projectId_status_idx" ON "Rfi"("projectId", "status");

-- CreateIndex
CREATE INDEX "Rfi_projectId_createdAt_idx" ON "Rfi"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Rfi_ganttTaskId_idx" ON "Rfi"("ganttTaskId");

-- CreateIndex
CREATE INDEX "Rfi_drawingId_idx" ON "Rfi"("drawingId");

-- CreateIndex
CREATE INDEX "Rfi_assignedToId_idx" ON "Rfi"("assignedToId");

-- CreateIndex
CREATE INDEX "Rfi_subcontractorId_idx" ON "Rfi"("subcontractorId");

-- CreateIndex
CREATE UNIQUE INDEX "Rfi_projectId_number_key" ON "Rfi"("projectId", "number");

-- CreateIndex
CREATE INDEX "RfiItem_rfiId_idx" ON "RfiItem"("rfiId");

-- CreateIndex
CREATE INDEX "RfiItem_boqItemId_idx" ON "RfiItem"("boqItemId");

-- CreateIndex
CREATE INDEX "RfiAttachment_rfiId_idx" ON "RfiAttachment"("rfiId");

-- CreateIndex
CREATE INDEX "RfiComment_rfiId_idx" ON "RfiComment"("rfiId");

-- CreateIndex
CREATE INDEX "RfiComment_parentId_idx" ON "RfiComment"("parentId");

-- CreateIndex
CREATE INDEX "RfiResponse_rfiId_idx" ON "RfiResponse"("rfiId");

-- CreateIndex
CREATE INDEX "DailyReport_projectId_reportDate_idx" ON "DailyReport"("projectId", "reportDate");

-- CreateIndex
CREATE INDEX "DailyReport_projectId_status_idx" ON "DailyReport"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_projectId_number_key" ON "DailyReport"("projectId", "number");

-- CreateIndex
CREATE INDEX "DailyReportAttachment_reportId_idx" ON "DailyReportAttachment"("reportId");

-- CreateIndex
CREATE INDEX "DailyReportWorkforce_reportId_idx" ON "DailyReportWorkforce"("reportId");

-- CreateIndex
CREATE INDEX "DailyReportProgress_reportId_idx" ON "DailyReportProgress"("reportId");

-- CreateIndex
CREATE INDEX "DailyReportEquipment_reportId_idx" ON "DailyReportEquipment"("reportId");

-- CreateIndex
CREATE INDEX "DailyReportMaterial_reportId_idx" ON "DailyReportMaterial"("reportId");

-- CreateIndex
CREATE INDEX "DailyReportMaterialConsumed_reportId_idx" ON "DailyReportMaterialConsumed"("reportId");

-- CreateIndex
CREATE INDEX "DailyReportVisitor_reportId_idx" ON "DailyReportVisitor"("reportId");

-- CreateIndex
CREATE INDEX "DailyReportMeeting_reportId_idx" ON "DailyReportMeeting"("reportId");

-- CreateIndex
CREATE INDEX "BoqItem_projectId_sortOrder_idx" ON "BoqItem"("projectId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "BoqItem_projectId_code_key" ON "BoqItem"("projectId", "code");

-- CreateIndex
CREATE INDEX "BoqIngredient_boqItemId_idx" ON "BoqIngredient"("boqItemId");

-- CreateIndex
CREATE INDEX "BoqIngredient_rateAnalysisId_idx" ON "BoqIngredient"("rateAnalysisId");

-- CreateIndex
CREATE INDEX "BoqIngredient_rateProfileItemId_idx" ON "BoqIngredient"("rateProfileItemId");

-- CreateIndex
CREATE INDEX "BoqIngredient_materialId_idx" ON "BoqIngredient"("materialId");

-- CreateIndex
CREATE INDEX "BoqIngredient_materialCatalogId_idx" ON "BoqIngredient"("materialCatalogId");

-- CreateIndex
CREATE INDEX "BoqIngredient_globalMaterialId_idx" ON "BoqIngredient"("globalMaterialId");

-- CreateIndex
CREATE INDEX "BoqIngredient_rateCatalogItemId_idx" ON "BoqIngredient"("rateCatalogItemId");

-- CreateIndex
CREATE INDEX "RateAnalysis_boqItemId_idx" ON "RateAnalysis"("boqItemId");

-- CreateIndex
CREATE INDEX "RateAnalysis_libraryId_idx" ON "RateAnalysis"("libraryId");

-- CreateIndex
CREATE INDEX "AnalysisLibrary_projectId_idx" ON "AnalysisLibrary"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisLibrary_projectId_purpose_key" ON "AnalysisLibrary"("projectId", "purpose");

-- CreateIndex
CREATE INDEX "BoqVersion_projectId_idx" ON "BoqVersion"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "BoqVersion_projectId_versionNumber_key" ON "BoqVersion"("projectId", "versionNumber");

-- CreateIndex
CREATE INDEX "BoqVersionItem_versionId_idx" ON "BoqVersionItem"("versionId");

-- CreateIndex
CREATE INDEX "BoqVersionItem_boqItemId_idx" ON "BoqVersionItem"("boqItemId");

-- CreateIndex
CREATE INDEX "GlobalPresetAnalysis_category_idx" ON "GlobalPresetAnalysis"("category");

-- CreateIndex
CREATE INDEX "GlobalPresetAnalysis_organizationId_idx" ON "GlobalPresetAnalysis"("organizationId");

-- CreateIndex
CREATE INDEX "GlobalPresetIngredient_presetId_idx" ON "GlobalPresetIngredient"("presetId");

-- CreateIndex
CREATE INDEX "GlobalPresetIngredient_materialCatalogId_idx" ON "GlobalPresetIngredient"("materialCatalogId");

-- CreateIndex
CREATE INDEX "GlobalPresetIngredient_globalMaterialId_idx" ON "GlobalPresetIngredient"("globalMaterialId");

-- CreateIndex
CREATE INDEX "RateProfile_organizationId_idx" ON "RateProfile"("organizationId");

-- CreateIndex
CREATE INDEX "RateProfile_projectId_idx" ON "RateProfile"("projectId");

-- CreateIndex
CREATE INDEX "RateProfileItem_rateProfileId_idx" ON "RateProfileItem"("rateProfileId");

-- CreateIndex
CREATE INDEX "RateProfileItem_materialCatalogId_idx" ON "RateProfileItem"("materialCatalogId");

-- CreateIndex
CREATE INDEX "RateProfileItem_globalMaterialId_idx" ON "RateProfileItem"("globalMaterialId");

-- CreateIndex
CREATE INDEX "GanttVersion_projectId_idx" ON "GanttVersion"("projectId");

-- CreateIndex
CREATE INDEX "GanttVersion_projectId_isActive_idx" ON "GanttVersion"("projectId", "isActive");

-- CreateIndex
CREATE INDEX "GanttVersion_projectId_scheduleType_idx" ON "GanttVersion"("projectId", "scheduleType");

-- CreateIndex
CREATE INDEX "GanttVersion_revisionOfId_idx" ON "GanttVersion"("revisionOfId");

-- CreateIndex
CREATE UNIQUE INDEX "GanttVersion_projectId_versionNumber_key" ON "GanttVersion"("projectId", "versionNumber");

-- CreateIndex
CREATE INDEX "GanttTask_projectId_sortOrder_idx" ON "GanttTask"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "GanttTask_parentId_idx" ON "GanttTask"("parentId");

-- CreateIndex
CREATE INDEX "ResourceAssignment_taskId_idx" ON "ResourceAssignment"("taskId");

-- CreateIndex
CREATE INDEX "ResourceAssignment_staffRoleId_idx" ON "ResourceAssignment"("staffRoleId");

-- CreateIndex
CREATE INDEX "ResourceAssignment_staffId_idx" ON "ResourceAssignment"("staffId");

-- CreateIndex
CREATE INDEX "ResourceAssignment_equipmentId_idx" ON "ResourceAssignment"("equipmentId");

-- CreateIndex
CREATE INDEX "TaskDependency_predecessorId_idx" ON "TaskDependency"("predecessorId");

-- CreateIndex
CREATE INDEX "TaskDependency_successorId_idx" ON "TaskDependency"("successorId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_predecessorId_successorId_key" ON "TaskDependency"("predecessorId", "successorId");

-- CreateIndex
CREATE INDEX "TaskBoqLink_taskId_idx" ON "TaskBoqLink"("taskId");

-- CreateIndex
CREATE INDEX "TaskBoqLink_boqItemId_idx" ON "TaskBoqLink"("boqItemId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskBoqLink_taskId_boqItemId_key" ON "TaskBoqLink"("taskId", "boqItemId");

-- CreateIndex
CREATE INDEX "GanttTaskTemplate_organizationId_idx" ON "GanttTaskTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "GanttTaskTemplate_projectId_idx" ON "GanttTaskTemplate"("projectId");

-- CreateIndex
CREATE INDEX "GanttTaskTemplate_category_idx" ON "GanttTaskTemplate"("category");

-- CreateIndex
CREATE INDEX "Partner_projectId_idx" ON "Partner"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_projectId_name_type_key" ON "Partner"("projectId", "name", "type");

-- CreateIndex
CREATE INDEX "PartnerSupply_partnerId_idx" ON "PartnerSupply"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerSupply_materialCatalogId_idx" ON "PartnerSupply"("materialCatalogId");

-- CreateIndex
CREATE INDEX "PartnerSupply_globalMaterialId_idx" ON "PartnerSupply"("globalMaterialId");

-- CreateIndex
CREATE INDEX "Material_projectId_idx" ON "Material"("projectId");

-- CreateIndex
CREATE INDEX "Material_materialCatalogId_idx" ON "Material"("materialCatalogId");

-- CreateIndex
CREATE INDEX "Material_orgMaterialEntryId_idx" ON "Material"("orgMaterialEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialTransaction_gateEntryId_key" ON "MaterialTransaction"("gateEntryId");

-- CreateIndex
CREATE INDEX "MaterialTransaction_materialId_idx" ON "MaterialTransaction"("materialId");

-- CreateIndex
CREATE INDEX "MaterialTransaction_projectId_date_idx" ON "MaterialTransaction"("projectId", "date");

-- CreateIndex
CREATE INDEX "MaterialTransaction_purchaseOrderId_idx" ON "MaterialTransaction"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "MaterialTransaction_materialCatalogId_idx" ON "MaterialTransaction"("materialCatalogId");

-- CreateIndex
CREATE INDEX "MaterialTransaction_storeLocationId_idx" ON "MaterialTransaction"("storeLocationId");

-- CreateIndex
CREATE INDEX "MaterialTransaction_targetStoreLocationId_idx" ON "MaterialTransaction"("targetStoreLocationId");

-- CreateIndex
CREATE INDEX "Supplier_projectId_idx" ON "Supplier"("projectId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_projectId_status_idx" ON "PurchaseOrder"("projectId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_partnerId_idx" ON "PurchaseOrder"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_projectId_number_key" ON "PurchaseOrder"("projectId", "number");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_requisitionItemId_idx" ON "PurchaseOrderItem"("requisitionItemId");

-- CreateIndex
CREATE INDEX "Equipment_projectId_idx" ON "Equipment"("projectId");

-- CreateIndex
CREATE INDEX "EquipmentLog_equipmentId_date_idx" ON "EquipmentLog"("equipmentId", "date");

-- CreateIndex
CREATE INDEX "EquipmentLog_projectId_date_idx" ON "EquipmentLog"("projectId", "date");

-- CreateIndex
CREATE INDEX "EquipmentLog_ganttTaskId_idx" ON "EquipmentLog"("ganttTaskId");

-- CreateIndex
CREATE INDEX "EquipmentLog_boqItemId_idx" ON "EquipmentLog"("boqItemId");

-- CreateIndex
CREATE INDEX "EquipmentMaintenance_equipmentId_idx" ON "EquipmentMaintenance"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentRental_equipmentId_idx" ON "EquipmentRental"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentRental_projectId_status_idx" ON "EquipmentRental"("projectId", "status");

-- CreateIndex
CREATE INDEX "EquipmentRental_vendorId_idx" ON "EquipmentRental"("vendorId");

-- CreateIndex
CREATE INDEX "EquipmentRental_partnerId_idx" ON "EquipmentRental"("partnerId");

-- CreateIndex
CREATE INDEX "EquipmentCrew_rentalId_idx" ON "EquipmentCrew"("rentalId");

-- CreateIndex
CREATE INDEX "EquipmentVendor_projectId_idx" ON "EquipmentVendor"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentVendor_projectId_name_key" ON "EquipmentVendor"("projectId", "name");

-- CreateIndex
CREATE INDEX "EquipmentDamage_rentalId_idx" ON "EquipmentDamage"("rentalId");

-- CreateIndex
CREATE INDEX "EquipmentDamage_date_idx" ON "EquipmentDamage"("date");

-- CreateIndex
CREATE INDEX "Plant_projectId_status_idx" ON "Plant"("projectId", "status");

-- CreateIndex
CREATE INDEX "PlantMixDesign_projectId_idx" ON "PlantMixDesign"("projectId");

-- CreateIndex
CREATE INDEX "PlantMixDesign_plantId_idx" ON "PlantMixDesign"("plantId");

-- CreateIndex
CREATE INDEX "PlantBatchTicket_projectId_dispatchDate_idx" ON "PlantBatchTicket"("projectId", "dispatchDate");

-- CreateIndex
CREATE INDEX "PlantBatchTicket_plantId_status_idx" ON "PlantBatchTicket"("plantId", "status");

-- CreateIndex
CREATE INDEX "PlantBatchTicket_ticketNumber_idx" ON "PlantBatchTicket"("ticketNumber");

-- CreateIndex
CREATE INDEX "PlantSilo_plantId_idx" ON "PlantSilo"("plantId");

-- CreateIndex
CREATE INDEX "PlantDailyLog_projectId_logDate_idx" ON "PlantDailyLog"("projectId", "logDate");

-- CreateIndex
CREATE UNIQUE INDEX "PlantDailyLog_plantId_logDate_key" ON "PlantDailyLog"("plantId", "logDate");

-- CreateIndex
CREATE INDEX "Document_projectId_type_idx" ON "Document"("projectId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Document_projectId_number_key" ON "Document"("projectId", "number");

-- CreateIndex
CREATE INDEX "DocumentRevision_documentId_idx" ON "DocumentRevision"("documentId");

-- CreateIndex
CREATE INDEX "Transmittal_projectId_date_idx" ON "Transmittal"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Transmittal_projectId_number_key" ON "Transmittal"("projectId", "number");

-- CreateIndex
CREATE INDEX "TransmittalItem_transmittalId_idx" ON "TransmittalItem"("transmittalId");

-- CreateIndex
CREATE INDEX "Drawing_projectId_discipline_idx" ON "Drawing"("projectId", "discipline");

-- CreateIndex
CREATE INDEX "Drawing_projectId_status_idx" ON "Drawing"("projectId", "status");

-- CreateIndex
CREATE INDEX "Drawing_ganttTaskId_idx" ON "Drawing"("ganttTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "Drawing_projectId_number_key" ON "Drawing"("projectId", "number");

-- CreateIndex
CREATE INDEX "DrawingRevision_drawingId_idx" ON "DrawingRevision"("drawingId");

-- CreateIndex
CREATE INDEX "Ipc_projectId_status_idx" ON "Ipc"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Ipc_projectId_number_key" ON "Ipc"("projectId", "number");

-- CreateIndex
CREATE INDEX "IpcItem_ipcId_idx" ON "IpcItem"("ipcId");

-- CreateIndex
CREATE INDEX "Staff_projectId_idx" ON "Staff"("projectId");

-- CreateIndex
CREATE INDEX "StaffRole_projectId_idx" ON "StaffRole"("projectId");

-- CreateIndex
CREATE INDEX "StaffRole_parentId_idx" ON "StaffRole"("parentId");

-- CreateIndex
CREATE INDEX "StaffRoleAssignment_staffRoleId_endDate_idx" ON "StaffRoleAssignment"("staffRoleId", "endDate");

-- CreateIndex
CREATE INDEX "StaffRoleAssignment_staffId_idx" ON "StaffRoleAssignment"("staffId");

-- CreateIndex
CREATE INDEX "StaffAttendance_projectId_date_idx" ON "StaffAttendance"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAttendance_staffId_date_key" ON "StaffAttendance"("staffId", "date");

-- CreateIndex
CREATE INDEX "DailyProgram_projectId_programDate_idx" ON "DailyProgram"("projectId", "programDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyProgram_projectId_programDate_key" ON "DailyProgram"("projectId", "programDate");

-- CreateIndex
CREATE INDEX "DailyProgramTask_programId_idx" ON "DailyProgramTask"("programId");

-- CreateIndex
CREATE INDEX "DailyProgramTask_rfiId_idx" ON "DailyProgramTask"("rfiId");

-- CreateIndex
CREATE INDEX "DailyProgramTask_ganttTaskId_idx" ON "DailyProgramTask"("ganttTaskId");

-- CreateIndex
CREATE INDEX "DailyProgramTask_subcontractorId_idx" ON "DailyProgramTask"("subcontractorId");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "GateEntry_projectId_idx" ON "GateEntry"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "GateEntry_projectId_number_key" ON "GateEntry"("projectId", "number");

-- CreateIndex
CREATE INDEX "Subcontractor_projectId_idx" ON "Subcontractor"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Subcontractor_projectId_name_key" ON "Subcontractor"("projectId", "name");

-- CreateIndex
CREATE INDEX "VariationOrder_projectId_status_idx" ON "VariationOrder"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VariationOrder_projectId_number_key" ON "VariationOrder"("projectId", "number");

-- CreateIndex
CREATE INDEX "VariationOrderItem_variationOrderId_idx" ON "VariationOrderItem"("variationOrderId");

-- CreateIndex
CREATE INDEX "VariationOrderItem_boqItemId_idx" ON "VariationOrderItem"("boqItemId");

-- CreateIndex
CREATE INDEX "ReportTemplate_entityType_scope_idx" ON "ReportTemplate"("entityType", "scope");

-- CreateIndex
CREATE INDEX "ReportTemplate_projectId_idx" ON "ReportTemplate"("projectId");

-- CreateIndex
CREATE INDEX "ReportTemplate_ownerId_idx" ON "ReportTemplate"("ownerId");

-- CreateIndex
CREATE INDEX "ReportTemplate_organizationId_idx" ON "ReportTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "ApprovedDocument_entityType_entityId_idx" ON "ApprovedDocument"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ApprovedDocument_projectId_idx" ON "ApprovedDocument"("projectId");

-- CreateIndex
CREATE INDEX "ApprovedDocument_uploadedById_idx" ON "ApprovedDocument"("uploadedById");

-- CreateIndex
CREATE INDEX "ProjectCost_projectId_date_idx" ON "ProjectCost"("projectId", "date");

-- CreateIndex
CREATE INDEX "ProjectCost_projectId_category_idx" ON "ProjectCost"("projectId", "category");

-- CreateIndex
CREATE INDEX "ProjectCost_boqItemId_idx" ON "ProjectCost"("boqItemId");

-- CreateIndex
CREATE INDEX "ProjectCost_ganttTaskId_idx" ON "ProjectCost"("ganttTaskId");

-- CreateIndex
CREATE INDEX "ProjectCost_source_idx" ON "ProjectCost"("source");

-- CreateIndex
CREATE INDEX "Correspondence_projectId_direction_idx" ON "Correspondence"("projectId", "direction");

-- CreateIndex
CREATE INDEX "Correspondence_projectId_replyStatus_idx" ON "Correspondence"("projectId", "replyStatus");

-- CreateIndex
CREATE INDEX "Correspondence_projectId_category_idx" ON "Correspondence"("projectId", "category");

-- CreateIndex
CREATE INDEX "Correspondence_projectId_letterType_idx" ON "Correspondence"("projectId", "letterType");

-- CreateIndex
CREATE INDEX "Correspondence_replyDueDate_idx" ON "Correspondence"("replyDueDate");

-- CreateIndex
CREATE INDEX "Correspondence_repliesToId_idx" ON "Correspondence"("repliesToId");

-- CreateIndex
CREATE INDEX "DrawingMarkup_drawingId_idx" ON "DrawingMarkup"("drawingId");

-- CreateIndex
CREATE INDEX "DrawingMarkup_revisionId_idx" ON "DrawingMarkup"("revisionId");

-- CreateIndex
CREATE INDEX "DrawingSet_projectId_idx" ON "DrawingSet"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawingSet_projectId_name_key" ON "DrawingSet"("projectId", "name");

-- CreateIndex
CREATE INDEX "Submittal_projectId_status_idx" ON "Submittal"("projectId", "status");

-- CreateIndex
CREATE INDEX "Submittal_projectId_type_idx" ON "Submittal"("projectId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Submittal_projectId_number_key" ON "Submittal"("projectId", "number");

-- CreateIndex
CREATE INDEX "PunchItem_projectId_status_idx" ON "PunchItem"("projectId", "status");

-- CreateIndex
CREATE INDEX "PunchItem_projectId_severity_idx" ON "PunchItem"("projectId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "PunchItem_projectId_number_key" ON "PunchItem"("projectId", "number");

-- CreateIndex
CREATE INDEX "ChatChannel_projectId_type_idx" ON "ChatChannel"("projectId", "type");

-- CreateIndex
CREATE INDEX "ChatMember_userId_idx" ON "ChatMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMember_channelId_userId_key" ON "ChatMember"("channelId", "userId");

-- CreateIndex
CREATE INDEX "ChatMessage_channelId_createdAt_idx" ON "ChatMessage"("channelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatReadReceipt_channelId_userId_key" ON "ChatReadReceipt"("channelId", "userId");

-- CreateIndex
CREATE INDEX "Payment_projectId_payeeType_idx" ON "Payment"("projectId", "payeeType");

-- CreateIndex
CREATE INDEX "Payment_projectId_paymentDate_idx" ON "Payment"("projectId", "paymentDate");

-- CreateIndex
CREATE INDEX "Payment_ipcId_idx" ON "Payment"("ipcId");

-- CreateIndex
CREATE INDEX "SafetyIncident_projectId_type_idx" ON "SafetyIncident"("projectId", "type");

-- CreateIndex
CREATE INDEX "SafetyIncident_projectId_status_idx" ON "SafetyIncident"("projectId", "status");

-- CreateIndex
CREATE INDEX "SafetyIncident_projectId_date_idx" ON "SafetyIncident"("projectId", "date");

-- CreateIndex
CREATE INDEX "QualityInspection_projectId_status_idx" ON "QualityInspection"("projectId", "status");

-- CreateIndex
CREATE INDEX "QualityInspection_projectId_inspectionType_idx" ON "QualityInspection"("projectId", "inspectionType");

-- CreateIndex
CREATE UNIQUE INDEX "QualityInspection_projectId_number_key" ON "QualityInspection"("projectId", "number");

-- CreateIndex
CREATE INDEX "Meeting_projectId_date_idx" ON "Meeting"("projectId", "date");

-- CreateIndex
CREATE INDEX "Meeting_projectId_status_idx" ON "Meeting"("projectId", "status");

-- CreateIndex
CREATE INDEX "MeetingActionItem_meetingId_idx" ON "MeetingActionItem"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingActionItem_status_idx" ON "MeetingActionItem"("status");

-- CreateIndex
CREATE INDEX "PurchaseRequisition_projectId_idx" ON "PurchaseRequisition"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequisition_projectId_number_key" ON "PurchaseRequisition"("projectId", "number");

-- CreateIndex
CREATE INDEX "PurchaseRequisitionItem_requisitionId_idx" ON "PurchaseRequisitionItem"("requisitionId");

-- CreateIndex
CREATE INDEX "RequisitionItemQuote_requisitionItemId_idx" ON "RequisitionItemQuote"("requisitionItemId");

-- CreateIndex
CREATE INDEX "StoreLocation_projectId_idx" ON "StoreLocation"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreLocation_projectId_name_key" ON "StoreLocation"("projectId", "name");

-- CreateIndex
CREATE INDEX "MaterialStoreStock_materialId_idx" ON "MaterialStoreStock"("materialId");

-- CreateIndex
CREATE INDEX "MaterialStoreStock_storeLocationId_idx" ON "MaterialStoreStock"("storeLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialStoreStock_materialId_storeLocationId_key" ON "MaterialStoreStock"("materialId", "storeLocationId");

-- CreateIndex
CREATE INDEX "VendorBill_projectId_status_idx" ON "VendorBill"("projectId", "status");

-- CreateIndex
CREATE INDEX "VendorBill_partnerId_idx" ON "VendorBill"("partnerId");

-- CreateIndex
CREATE INDEX "VendorBill_purchaseOrderId_idx" ON "VendorBill"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorBill_projectId_partnerId_billNumber_key" ON "VendorBill"("projectId", "partnerId", "billNumber");

-- CreateIndex
CREATE INDEX "VendorPayment_projectId_idx" ON "VendorPayment"("projectId");

-- CreateIndex
CREATE INDEX "VendorPayment_vendorBillId_idx" ON "VendorPayment"("vendorBillId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMaterialEntry" ADD CONSTRAINT "OrgMaterialEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMaterialEntry" ADD CONSTRAINT "OrgMaterialEntry_globalMaterialId_fkey" FOREIGN KEY ("globalMaterialId") REFERENCES "GlobalMaterialCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCatalog" ADD CONSTRAINT "MaterialCatalog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCatalog" ADD CONSTRAINT "RateCatalog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCatalog" ADD CONSTRAINT "RateCatalog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCatalogItem" ADD CONSTRAINT "RateCatalogItem_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "RateCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCatalogItem" ADD CONSTRAINT "RateCatalogItem_materialCatalogId_fkey" FOREIGN KEY ("materialCatalogId") REFERENCES "MaterialCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCatalogItem" ADD CONSTRAINT "RateCatalogItem_globalMaterialId_fkey" FOREIGN KEY ("globalMaterialId") REFERENCES "GlobalMaterialCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCatalogItemRate" ADD CONSTRAINT "RateCatalogItemRate_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "RateCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRateColumn" ADD CONSTRAINT "ProjectRateColumn_rateCatalogId_fkey" FOREIGN KEY ("rateCatalogId") REFERENCES "RateCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRateColumn" ADD CONSTRAINT "ProjectRateColumn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRateColumnEntry" ADD CONSTRAINT "ProjectRateColumnEntry_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "ProjectRateColumn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRateColumnEntry" ADD CONSTRAINT "ProjectRateColumnEntry_rateCatalogItemId_fkey" FOREIGN KEY ("rateCatalogItemId") REFERENCES "RateCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgRateCatalog" ADD CONSTRAINT "OrgRateCatalog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgRateCatalog" ADD CONSTRAINT "OrgRateCatalog_parentGlobalCatalogId_fkey" FOREIGN KEY ("parentGlobalCatalogId") REFERENCES "RateCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgRateOverride" ADD CONSTRAINT "OrgRateOverride_orgCatalogId_fkey" FOREIGN KEY ("orgCatalogId") REFERENCES "OrgRateCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgRateOverride" ADD CONSTRAINT "OrgRateOverride_orgMaterialEntryId_fkey" FOREIGN KEY ("orgMaterialEntryId") REFERENCES "OrgMaterialEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRateOverride" ADD CONSTRAINT "ProjectRateOverride_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRateOverride" ADD CONSTRAINT "ProjectRateOverride_orgCatalogId_fkey" FOREIGN KEY ("orgCatalogId") REFERENCES "OrgRateCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRateOverride" ADD CONSTRAINT "ProjectRateOverride_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UncatalogedMaterial" ADD CONSTRAINT "UncatalogedMaterial_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialMergeLog" ADD CONSTRAINT "MaterialMergeLog_mergedById_fkey" FOREIGN KEY ("mergedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateFiscalYearAudit" ADD CONSTRAINT "RateFiscalYearAudit_globalMaterialId_fkey" FOREIGN KEY ("globalMaterialId") REFERENCES "GlobalMaterialCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketRateRevisionLog" ADD CONSTRAINT "MarketRateRevisionLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketRateRevisionLog" ADD CONSTRAINT "MarketRateRevisionLog_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketRateRevisionEntry" ADD CONSTRAINT "MarketRateRevisionEntry_revisionLogId_fkey" FOREIGN KEY ("revisionLogId") REFERENCES "MarketRateRevisionLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnrecognizedMaterial" ADD CONSTRAINT "UnrecognizedMaterial_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_costLibraryId_fkey" FOREIGN KEY ("costLibraryId") REFERENCES "AnalysisLibrary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_ganttTaskId_fkey" FOREIGN KEY ("ganttTaskId") REFERENCES "GanttTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfiItem" ADD CONSTRAINT "RfiItem_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "Rfi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfiItem" ADD CONSTRAINT "RfiItem_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfiAttachment" ADD CONSTRAINT "RfiAttachment_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "Rfi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfiComment" ADD CONSTRAINT "RfiComment_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "Rfi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfiComment" ADD CONSTRAINT "RfiComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfiResponse" ADD CONSTRAINT "RfiResponse_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "Rfi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfiResponse" ADD CONSTRAINT "RfiResponse_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportAttachment" ADD CONSTRAINT "DailyReportAttachment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportWorkforce" ADD CONSTRAINT "DailyReportWorkforce_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportProgress" ADD CONSTRAINT "DailyReportProgress_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportEquipment" ADD CONSTRAINT "DailyReportEquipment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportMaterial" ADD CONSTRAINT "DailyReportMaterial_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportMaterialConsumed" ADD CONSTRAINT "DailyReportMaterialConsumed_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportVisitor" ADD CONSTRAINT "DailyReportVisitor_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportMeeting" ADD CONSTRAINT "DailyReportMeeting_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqItem" ADD CONSTRAINT "BoqItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqIngredient" ADD CONSTRAINT "BoqIngredient_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqIngredient" ADD CONSTRAINT "BoqIngredient_rateAnalysisId_fkey" FOREIGN KEY ("rateAnalysisId") REFERENCES "RateAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqIngredient" ADD CONSTRAINT "BoqIngredient_rateProfileItemId_fkey" FOREIGN KEY ("rateProfileItemId") REFERENCES "RateProfileItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqIngredient" ADD CONSTRAINT "BoqIngredient_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqIngredient" ADD CONSTRAINT "BoqIngredient_materialCatalogId_fkey" FOREIGN KEY ("materialCatalogId") REFERENCES "MaterialCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqIngredient" ADD CONSTRAINT "BoqIngredient_globalMaterialId_fkey" FOREIGN KEY ("globalMaterialId") REFERENCES "GlobalMaterialCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqIngredient" ADD CONSTRAINT "BoqIngredient_rateCatalogItemId_fkey" FOREIGN KEY ("rateCatalogItemId") REFERENCES "RateCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateAnalysis" ADD CONSTRAINT "RateAnalysis_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateAnalysis" ADD CONSTRAINT "RateAnalysis_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "AnalysisLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisLibrary" ADD CONSTRAINT "AnalysisLibrary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqVersion" ADD CONSTRAINT "BoqVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqVersion" ADD CONSTRAINT "BoqVersion_variationOrderId_fkey" FOREIGN KEY ("variationOrderId") REFERENCES "VariationOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqVersionItem" ADD CONSTRAINT "BoqVersionItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "BoqVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoqVersionItem" ADD CONSTRAINT "BoqVersionItem_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalPresetAnalysis" ADD CONSTRAINT "GlobalPresetAnalysis_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalPresetIngredient" ADD CONSTRAINT "GlobalPresetIngredient_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "GlobalPresetAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalPresetIngredient" ADD CONSTRAINT "GlobalPresetIngredient_materialCatalogId_fkey" FOREIGN KEY ("materialCatalogId") REFERENCES "MaterialCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalPresetIngredient" ADD CONSTRAINT "GlobalPresetIngredient_globalMaterialId_fkey" FOREIGN KEY ("globalMaterialId") REFERENCES "GlobalMaterialCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateProfile" ADD CONSTRAINT "RateProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateProfile" ADD CONSTRAINT "RateProfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateProfileItem" ADD CONSTRAINT "RateProfileItem_rateProfileId_fkey" FOREIGN KEY ("rateProfileId") REFERENCES "RateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateProfileItem" ADD CONSTRAINT "RateProfileItem_materialCatalogId_fkey" FOREIGN KEY ("materialCatalogId") REFERENCES "MaterialCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateProfileItem" ADD CONSTRAINT "RateProfileItem_globalMaterialId_fkey" FOREIGN KEY ("globalMaterialId") REFERENCES "GlobalMaterialCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GanttVersion" ADD CONSTRAINT "GanttVersion_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "GanttVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GanttVersion" ADD CONSTRAINT "GanttVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GanttVersion" ADD CONSTRAINT "GanttVersion_revisionOfId_fkey" FOREIGN KEY ("revisionOfId") REFERENCES "GanttVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GanttVersion" ADD CONSTRAINT "GanttVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GanttTask" ADD CONSTRAINT "GanttTask_planningTaskId_fkey" FOREIGN KEY ("planningTaskId") REFERENCES "GanttTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GanttTask" ADD CONSTRAINT "GanttTask_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "GanttVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GanttTask" ADD CONSTRAINT "GanttTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GanttTask" ADD CONSTRAINT "GanttTask_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "GanttVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GanttTask" ADD CONSTRAINT "GanttTask_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "GanttTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GanttTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_staffRoleId_fkey" FOREIGN KEY ("staffRoleId") REFERENCES "StaffRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "GanttTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "GanttTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskBoqLink" ADD CONSTRAINT "TaskBoqLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "GanttTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskBoqLink" ADD CONSTRAINT "TaskBoqLink_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GanttTaskTemplate" ADD CONSTRAINT "GanttTaskTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GanttTaskTemplate" ADD CONSTRAINT "GanttTaskTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GanttTaskTemplate" ADD CONSTRAINT "GanttTaskTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerSupply" ADD CONSTRAINT "PartnerSupply_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerSupply" ADD CONSTRAINT "PartnerSupply_materialCatalogId_fkey" FOREIGN KEY ("materialCatalogId") REFERENCES "MaterialCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerSupply" ADD CONSTRAINT "PartnerSupply_globalMaterialId_fkey" FOREIGN KEY ("globalMaterialId") REFERENCES "GlobalMaterialCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_materialCatalogId_fkey" FOREIGN KEY ("materialCatalogId") REFERENCES "MaterialCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_orgMaterialEntryId_fkey" FOREIGN KEY ("orgMaterialEntryId") REFERENCES "OrgMaterialEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialTransaction" ADD CONSTRAINT "MaterialTransaction_storeLocationId_fkey" FOREIGN KEY ("storeLocationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialTransaction" ADD CONSTRAINT "MaterialTransaction_targetStoreLocationId_fkey" FOREIGN KEY ("targetStoreLocationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialTransaction" ADD CONSTRAINT "MaterialTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialTransaction" ADD CONSTRAINT "MaterialTransaction_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialTransaction" ADD CONSTRAINT "MaterialTransaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialTransaction" ADD CONSTRAINT "MaterialTransaction_gateEntryId_fkey" FOREIGN KEY ("gateEntryId") REFERENCES "GateEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialTransaction" ADD CONSTRAINT "MaterialTransaction_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialTransaction" ADD CONSTRAINT "MaterialTransaction_materialCatalogId_fkey" FOREIGN KEY ("materialCatalogId") REFERENCES "MaterialCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "PurchaseRequisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_requisitionItemId_fkey" FOREIGN KEY ("requisitionItemId") REFERENCES "PurchaseRequisitionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLog" ADD CONSTRAINT "EquipmentLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLog" ADD CONSTRAINT "EquipmentLog_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLog" ADD CONSTRAINT "EquipmentLog_ganttTaskId_fkey" FOREIGN KEY ("ganttTaskId") REFERENCES "GanttTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLog" ADD CONSTRAINT "EquipmentLog_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentMaintenance" ADD CONSTRAINT "EquipmentMaintenance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentMaintenance" ADD CONSTRAINT "EquipmentMaintenance_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRental" ADD CONSTRAINT "EquipmentRental_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRental" ADD CONSTRAINT "EquipmentRental_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRental" ADD CONSTRAINT "EquipmentRental_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRental" ADD CONSTRAINT "EquipmentRental_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "EquipmentVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentCrew" ADD CONSTRAINT "EquipmentCrew_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "EquipmentRental"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentVendor" ADD CONSTRAINT "EquipmentVendor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentDamage" ADD CONSTRAINT "EquipmentDamage_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "EquipmentRental"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plant" ADD CONSTRAINT "Plant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plant" ADD CONSTRAINT "Plant_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantMixDesign" ADD CONSTRAINT "PlantMixDesign_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantMixDesign" ADD CONSTRAINT "PlantMixDesign_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantMixDesign" ADD CONSTRAINT "PlantMixDesign_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantBatchTicket" ADD CONSTRAINT "PlantBatchTicket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantBatchTicket" ADD CONSTRAINT "PlantBatchTicket_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantBatchTicket" ADD CONSTRAINT "PlantBatchTicket_mixDesignId_fkey" FOREIGN KEY ("mixDesignId") REFERENCES "PlantMixDesign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantBatchTicket" ADD CONSTRAINT "PlantBatchTicket_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "Rfi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantSilo" ADD CONSTRAINT "PlantSilo_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantDailyLog" ADD CONSTRAINT "PlantDailyLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantDailyLog" ADD CONSTRAINT "PlantDailyLog_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transmittal" ADD CONSTRAINT "Transmittal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransmittalItem" ADD CONSTRAINT "TransmittalItem_transmittalId_fkey" FOREIGN KEY ("transmittalId") REFERENCES "Transmittal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransmittalItem" ADD CONSTRAINT "TransmittalItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_ganttTaskId_fkey" FOREIGN KEY ("ganttTaskId") REFERENCES "GanttTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_drawingSetId_fkey" FOREIGN KEY ("drawingSetId") REFERENCES "DrawingSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingRevision" ADD CONSTRAINT "DrawingRevision_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ipc" ADD CONSTRAINT "Ipc_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ipc" ADD CONSTRAINT "Ipc_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ipc" ADD CONSTRAINT "Ipc_boqVersionId_fkey" FOREIGN KEY ("boqVersionId") REFERENCES "BoqVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpcItem" ADD CONSTRAINT "IpcItem_ipcId_fkey" FOREIGN KEY ("ipcId") REFERENCES "Ipc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRole" ADD CONSTRAINT "StaffRole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRole" ADD CONSTRAINT "StaffRole_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StaffRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRoleAssignment" ADD CONSTRAINT "StaffRoleAssignment_staffRoleId_fkey" FOREIGN KEY ("staffRoleId") REFERENCES "StaffRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRoleAssignment" ADD CONSTRAINT "StaffRoleAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgram" ADD CONSTRAINT "DailyProgram_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgramTask" ADD CONSTRAINT "DailyProgramTask_carriedOverFromId_fkey" FOREIGN KEY ("carriedOverFromId") REFERENCES "DailyProgramTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgramTask" ADD CONSTRAINT "DailyProgramTask_programId_fkey" FOREIGN KEY ("programId") REFERENCES "DailyProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgramTask" ADD CONSTRAINT "DailyProgramTask_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "Rfi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgramTask" ADD CONSTRAINT "DailyProgramTask_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgramTask" ADD CONSTRAINT "DailyProgramTask_ganttTaskId_fkey" FOREIGN KEY ("ganttTaskId") REFERENCES "GanttTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgramTask" ADD CONSTRAINT "DailyProgramTask_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateEntry" ADD CONSTRAINT "GateEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcontractor" ADD CONSTRAINT "Subcontractor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationOrder" ADD CONSTRAINT "VariationOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationOrderItem" ADD CONSTRAINT "VariationOrderItem_variationOrderId_fkey" FOREIGN KEY ("variationOrderId") REFERENCES "VariationOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationOrderItem" ADD CONSTRAINT "VariationOrderItem_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedDocument" ADD CONSTRAINT "ApprovedDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovedDocument" ADD CONSTRAINT "ApprovedDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_ganttTaskId_fkey" FOREIGN KEY ("ganttTaskId") REFERENCES "GanttTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_repliesToId_fkey" FOREIGN KEY ("repliesToId") REFERENCES "Correspondence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingSet" ADD CONSTRAINT "DrawingSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submittal" ADD CONSTRAINT "Submittal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadReceipt" ADD CONSTRAINT "ChatReadReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadReceipt" ADD CONSTRAINT "ChatReadReceipt_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingActionItem" ADD CONSTRAINT "MeetingActionItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisitionItem" ADD CONSTRAINT "PurchaseRequisitionItem_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "PurchaseRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisitionItem" ADD CONSTRAINT "PurchaseRequisitionItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionItemQuote" ADD CONSTRAINT "RequisitionItemQuote_requisitionItemId_fkey" FOREIGN KEY ("requisitionItemId") REFERENCES "PurchaseRequisitionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionItemQuote" ADD CONSTRAINT "RequisitionItemQuote_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreLocation" ADD CONSTRAINT "StoreLocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialStoreStock" ADD CONSTRAINT "MaterialStoreStock_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialStoreStock" ADD CONSTRAINT "MaterialStoreStock_storeLocationId_fkey" FOREIGN KEY ("storeLocationId") REFERENCES "StoreLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "VendorBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

