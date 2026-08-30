-- RLS pre-flight audit (gap G-3): run against PRODUCTION (read-only).
-- Every row must be 0 before the table's rollout phase enables RLS.
SELECT 'BankGuarantee' AS tbl, count(*) AS null_org_rows FROM "BankGuarantee" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'CatalogMaterial' AS tbl, count(*) AS null_org_rows FROM "CatalogMaterial" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'CompanyBankAccount' AS tbl, count(*) AS null_org_rows FROM "CompanyBankAccount" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'DelegationRule' AS tbl, count(*) AS null_org_rows FROM "DelegationRule" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'FiscalYearLock' AS tbl, count(*) AS null_org_rows FROM "FiscalYearLock" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'GanttTaskTemplate' AS tbl, count(*) AS null_org_rows FROM "GanttTaskTemplate" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'GlobalPresetAnalysis' AS tbl, count(*) AS null_org_rows FROM "GlobalPresetAnalysis" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'HeadOfficeExpense' AS tbl, count(*) AS null_org_rows FROM "HeadOfficeExpense" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'JournalEntry' AS tbl, count(*) AS null_org_rows FROM "JournalEntry" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'Project' AS tbl, count(*) AS null_org_rows FROM "Project" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'RateBook(map:RateCatalog)' AS tbl, count(*) AS null_org_rows FROM "RateCatalog" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'RateProfile' AS tbl, count(*) AS null_org_rows FROM "RateProfile" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'ReportSnapshot' AS tbl, count(*) AS null_org_rows FROM "ReportSnapshot" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'ReportTemplate' AS tbl, count(*) AS null_org_rows FROM "ReportTemplate" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'StoredFile' AS tbl, count(*) AS null_org_rows FROM "StoredFile" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'UncatalogedMaterial' AS tbl, count(*) AS null_org_rows FROM "UncatalogedMaterial" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'User' AS tbl, count(*) AS null_org_rows FROM "User" WHERE "organizationId" IS NULL
UNION ALL
SELECT 'AnalysisLibrary' AS tbl, count(*) AS null_project_rows FROM "AnalysisLibrary" WHERE "projectId" IS NULL
UNION ALL
SELECT 'ApprovedDocument' AS tbl, count(*) AS null_project_rows FROM "ApprovedDocument" WHERE "projectId" IS NULL
UNION ALL
SELECT 'AuditLog' AS tbl, count(*) AS null_project_rows FROM "AuditLog" WHERE "projectId" IS NULL
UNION ALL
SELECT 'BoqItem' AS tbl, count(*) AS null_project_rows FROM "BoqItem" WHERE "projectId" IS NULL
UNION ALL
SELECT 'BoqVersion' AS tbl, count(*) AS null_project_rows FROM "BoqVersion" WHERE "projectId" IS NULL
UNION ALL
SELECT 'ChatChannel' AS tbl, count(*) AS null_project_rows FROM "ChatChannel" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Correspondence' AS tbl, count(*) AS null_project_rows FROM "Correspondence" WHERE "projectId" IS NULL
UNION ALL
SELECT 'DailyProgram' AS tbl, count(*) AS null_project_rows FROM "DailyProgram" WHERE "projectId" IS NULL
UNION ALL
SELECT 'DailyReport' AS tbl, count(*) AS null_project_rows FROM "DailyReport" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Document' AS tbl, count(*) AS null_project_rows FROM "Document" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Drawing' AS tbl, count(*) AS null_project_rows FROM "Drawing" WHERE "projectId" IS NULL
UNION ALL
SELECT 'DrawingSet' AS tbl, count(*) AS null_project_rows FROM "DrawingSet" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Equipment' AS tbl, count(*) AS null_project_rows FROM "Equipment" WHERE "projectId" IS NULL
UNION ALL
SELECT 'EquipmentLog' AS tbl, count(*) AS null_project_rows FROM "EquipmentLog" WHERE "projectId" IS NULL
UNION ALL
SELECT 'EquipmentMaintenance' AS tbl, count(*) AS null_project_rows FROM "EquipmentMaintenance" WHERE "projectId" IS NULL
UNION ALL
SELECT 'EquipmentRental' AS tbl, count(*) AS null_project_rows FROM "EquipmentRental" WHERE "projectId" IS NULL
UNION ALL
SELECT 'EquipmentSpotHire' AS tbl, count(*) AS null_project_rows FROM "EquipmentSpotHire" WHERE "projectId" IS NULL
UNION ALL
SELECT 'EquipmentVendor' AS tbl, count(*) AS null_project_rows FROM "EquipmentVendor" WHERE "projectId" IS NULL
UNION ALL
SELECT 'GanttTask' AS tbl, count(*) AS null_project_rows FROM "GanttTask" WHERE "projectId" IS NULL
UNION ALL
SELECT 'GanttVersion' AS tbl, count(*) AS null_project_rows FROM "GanttVersion" WHERE "projectId" IS NULL
UNION ALL
SELECT 'GateEntry' AS tbl, count(*) AS null_project_rows FROM "GateEntry" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Ipc' AS tbl, count(*) AS null_project_rows FROM "Ipc" WHERE "projectId" IS NULL
UNION ALL
SELECT 'JournalEntryLine' AS tbl, count(*) AS null_project_rows FROM "JournalEntryLine" WHERE "projectId" IS NULL
UNION ALL
SELECT 'JvPartnerAgreement' AS tbl, count(*) AS null_project_rows FROM "JvPartnerAgreement" WHERE "projectId" IS NULL
UNION ALL
SELECT 'LeaveBalance' AS tbl, count(*) AS null_project_rows FROM "LeaveBalance" WHERE "projectId" IS NULL
UNION ALL
SELECT 'LeaveRequest' AS tbl, count(*) AS null_project_rows FROM "LeaveRequest" WHERE "projectId" IS NULL
UNION ALL
SELECT 'MarketRateRevisionLog' AS tbl, count(*) AS null_project_rows FROM "MarketRateRevisionLog" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Material' AS tbl, count(*) AS null_project_rows FROM "Material" WHERE "projectId" IS NULL
UNION ALL
SELECT 'MaterialTransaction' AS tbl, count(*) AS null_project_rows FROM "MaterialTransaction" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Meeting' AS tbl, count(*) AS null_project_rows FROM "Meeting" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Notification' AS tbl, count(*) AS null_project_rows FROM "Notification" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Partner' AS tbl, count(*) AS null_project_rows FROM "Partner" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Payment' AS tbl, count(*) AS null_project_rows FROM "Payment" WHERE "projectId" IS NULL
UNION ALL
SELECT 'PaymentCategory' AS tbl, count(*) AS null_project_rows FROM "PaymentCategory" WHERE "projectId" IS NULL
UNION ALL
SELECT 'PayrollRun' AS tbl, count(*) AS null_project_rows FROM "PayrollRun" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Plant' AS tbl, count(*) AS null_project_rows FROM "Plant" WHERE "projectId" IS NULL
UNION ALL
SELECT 'PlantBatchTicket' AS tbl, count(*) AS null_project_rows FROM "PlantBatchTicket" WHERE "projectId" IS NULL
UNION ALL
SELECT 'PlantDailyLog' AS tbl, count(*) AS null_project_rows FROM "PlantDailyLog" WHERE "projectId" IS NULL
UNION ALL
SELECT 'PlantMixDesign' AS tbl, count(*) AS null_project_rows FROM "PlantMixDesign" WHERE "projectId" IS NULL
UNION ALL
SELECT 'ProjectCost' AS tbl, count(*) AS null_project_rows FROM "ProjectCost" WHERE "projectId" IS NULL
UNION ALL
SELECT 'ProjectMember' AS tbl, count(*) AS null_project_rows FROM "ProjectMember" WHERE "projectId" IS NULL
UNION ALL
SELECT 'PunchItem' AS tbl, count(*) AS null_project_rows FROM "PunchItem" WHERE "projectId" IS NULL
UNION ALL
SELECT 'PurchaseOrder' AS tbl, count(*) AS null_project_rows FROM "PurchaseOrder" WHERE "projectId" IS NULL
UNION ALL
SELECT 'PurchaseRequisition' AS tbl, count(*) AS null_project_rows FROM "PurchaseRequisition" WHERE "projectId" IS NULL
UNION ALL
SELECT 'QualityInspection' AS tbl, count(*) AS null_project_rows FROM "QualityInspection" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Rfi' AS tbl, count(*) AS null_project_rows FROM "Rfi" WHERE "projectId" IS NULL
UNION ALL
SELECT 'SafetyIncident' AS tbl, count(*) AS null_project_rows FROM "SafetyIncident" WHERE "projectId" IS NULL
UNION ALL
SELECT 'SiteExpense' AS tbl, count(*) AS null_project_rows FROM "SiteExpense" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Staff' AS tbl, count(*) AS null_project_rows FROM "Staff" WHERE "projectId" IS NULL
UNION ALL
SELECT 'StaffAdvance' AS tbl, count(*) AS null_project_rows FROM "StaffAdvance" WHERE "projectId" IS NULL
UNION ALL
SELECT 'StaffAttendance' AS tbl, count(*) AS null_project_rows FROM "StaffAttendance" WHERE "projectId" IS NULL
UNION ALL
SELECT 'StaffRole' AS tbl, count(*) AS null_project_rows FROM "StaffRole" WHERE "projectId" IS NULL
UNION ALL
SELECT 'StoreLocation' AS tbl, count(*) AS null_project_rows FROM "StoreLocation" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Subcontractor' AS tbl, count(*) AS null_project_rows FROM "Subcontractor" WHERE "projectId" IS NULL
UNION ALL
SELECT 'SubcontractorBill' AS tbl, count(*) AS null_project_rows FROM "SubcontractorBill" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Submittal' AS tbl, count(*) AS null_project_rows FROM "Submittal" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Supplier' AS tbl, count(*) AS null_project_rows FROM "Supplier" WHERE "projectId" IS NULL
UNION ALL
SELECT 'Transmittal' AS tbl, count(*) AS null_project_rows FROM "Transmittal" WHERE "projectId" IS NULL
UNION ALL
SELECT 'VariationOrder' AS tbl, count(*) AS null_project_rows FROM "VariationOrder" WHERE "projectId" IS NULL
UNION ALL
SELECT 'VatBill' AS tbl, count(*) AS null_project_rows FROM "VatBill" WHERE "projectId" IS NULL
UNION ALL
SELECT 'VendorBill' AS tbl, count(*) AS null_project_rows FROM "VendorBill" WHERE "projectId" IS NULL
UNION ALL
SELECT 'VendorPayment' AS tbl, count(*) AS null_project_rows FROM "VendorPayment" WHERE "projectId" IS NULL;
