/**
 * Root tRPC router for Construction Manager.
 * Merges all sub-routers.
 */
import { router } from "@/server/trpc";
import { boqRouter } from "./boq";
import { boqVersionRouter } from "./boq-version";
import { rateAnalysisRouter } from "./rate-analysis";
import { rateProfileRouter } from "./rate-profile";
import { analysisLibraryRouter } from "./analysis-library";
import { globalPresetRouter } from "./global-preset";
import { ganttRouter } from "./gantt";
import { ipcRouter } from "./ipc";
import { projectRouter } from "./project";
import { partnerRouter } from "./partner";
import { materialRouter } from "./material";
import { equipmentRouter } from "./equipment";
import { hrRouter } from "./hr";
import { staffRoleRouter } from "./staff-role";
import { resourceAssignmentRouter } from "./resource-assignment";
import { notificationRouter } from "./notification";
import { purchaseOrderRouter } from "./purchase-order";
import { documentRouter } from "./document";
import { variationOrderRouter } from "./variation-order";
import { workflowRouter } from "./workflow";
import { reportTemplateRouter } from "./report-template";
import { approvedDocumentRouter } from "./approved-document";
import { projectCostRouter } from "./project-cost";
import { dashboardRouter } from "./dashboard";
import { correspondenceRouter } from "./correspondence";
import { submittalRouter } from "./submittal";
import { punchListRouter } from "./punch-list";
import { chatRouter } from "./chat";
import { projectOpsRouter } from "./project-ops";
import { financeRouter } from "./finance";
import { executionRouter } from "./execution";
import { uncatalogedMaterialRouter } from "./uncataloged-material";
import { fiscalYearRouter } from "./fiscal-year";
import { userPreferencesRouter } from "./user-preferences";
import { requisitionRouter } from "./requisition";
import { storeLocationRouter } from "./store-location";
import { vendorBillRouter } from "./vendor-bill";
import { procurementLookaheadRouter } from "./procurement-lookahead";
import { plantProductionRouter } from "./plant-production";
import { adminRouter } from "./admin";
import { subcontractorBillRouter } from "./subcontractor-bill";
import { leaveRouter } from "./leave";
import { payrollRouter } from "./payroll";
import { siteExpenseRouter } from "./site-expense";
import { catalogV2Router } from "./catalog-v2";
import { vatRegisterRouter } from "./vat-register";
import { paymentCategoryRouter } from "./payment-category";

export const appRouter = router({
  boq: boqRouter,
  boqVersion: boqVersionRouter,
  rateAnalysis: rateAnalysisRouter,
  rateProfile: rateProfileRouter,
  analysisLibrary: analysisLibraryRouter,
  globalPreset: globalPresetRouter,
  gantt: ganttRouter,
  ipc: ipcRouter,
  project: projectRouter,
  workflow: workflowRouter,
  partner: partnerRouter,
  material: materialRouter,
  equipment: equipmentRouter,
  hr: hrRouter,
  staffRole: staffRoleRouter,
  resourceAssignment: resourceAssignmentRouter,
  notification: notificationRouter,
  purchaseOrder: purchaseOrderRouter,
  document: documentRouter,
  variationOrder: variationOrderRouter,
  reportTemplate: reportTemplateRouter,
  approvedDocument: approvedDocumentRouter,
  projectCost: projectCostRouter,
  dashboard: dashboardRouter,
  correspondence: correspondenceRouter,
  submittal: submittalRouter,
  punchList: punchListRouter,
  chat: chatRouter,
  projectOps: projectOpsRouter,
  finance: financeRouter,
  execution: executionRouter,
  uncatalogedMaterial: uncatalogedMaterialRouter,
  fiscalYear: fiscalYearRouter,
  userPreferences: userPreferencesRouter,
  requisition: requisitionRouter,
  storeLocation: storeLocationRouter,
  vendorBill: vendorBillRouter,
  subcontractorBill: subcontractorBillRouter,
  procurementLookahead: procurementLookaheadRouter,
  plantProduction: plantProductionRouter,
  admin: adminRouter,
  leave: leaveRouter,
  payroll: payrollRouter,
  siteExpense: siteExpenseRouter,
  catalogV2: catalogV2Router,
  vatRegister: vatRegisterRouter,
  paymentCategory: paymentCategoryRouter,
});

export type AppRouter = typeof appRouter;
