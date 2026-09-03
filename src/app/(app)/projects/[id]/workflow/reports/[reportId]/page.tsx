"use client";

import { use } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CloudSun,
  Users,
  Wrench,
  Package,
  ListChecks,
  Users2,
  FileSpreadsheet,
  AlertCircle,
  Shield,
  FileText,
  Camera,
} from "lucide-react";
import { ShareReportDialog } from "@/components/reports/share-report-dialog";
import { PhotoSection } from "@/components/workflow/report-photo-section";
import { WeatherSection } from "./sections/weather-section";
import { ProgressSection } from "./sections/progress-section";
import { WorkforceSection } from "./sections/workforce-section";
import { EquipmentSection } from "./sections/equipment-section";
import { MaterialsSection } from "./sections/materials-section";
import { VisitorsSection } from "./sections/visitors-section";
import { MeetingsSection } from "./sections/meetings-section";
import { ProblemsSection, SafetySection, RemarksSection } from "./sections/notes-section";
import { useDailyReportState } from "./sections/use-daily-report-state";
import { DailyReportHeader } from "./sections/daily-report-header";
import { DailyReportSidebar } from "./sections/daily-report-sidebar";

const SECTIONS = [
  { id: "weather", label: "Weather", icon: CloudSun, field: "weather" },
  { id: "workforce", label: "Workforce", icon: Users, field: "workforce" },
  { id: "equipment", label: "Equipment", icon: Wrench, field: "equipmentUsed" },
  { id: "materials", label: "Materials Received", icon: Package, field: "materialReceived" },
  { id: "progress", label: "Plan vs Actual", icon: ListChecks, field: "workProgress" },
  { id: "photos", label: "Site Photos", icon: Camera, field: "attachments" },
  { id: "visitors", label: "Visitors", icon: Users2, field: "siteVisits" },
  { id: "meetings", label: "Meetings", icon: FileSpreadsheet, field: "meetings" },
  { id: "problems", label: "Problems", icon: AlertCircle, field: "problems" },
  { id: "safety", label: "Safety", icon: Shield, field: "safetyNotes" },
  { id: "remarks", label: "Remarks", icon: FileText, field: "remarks" },
];

export default function UnifiedDailyReportPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id, reportId } = use(params);

  const {
    report,
    projectInfo,
    isLoading,
    isAdmin,
    canEdit,
    canDelete,
    activeSection,
    setActiveSection,
    saving,
    lastSaved,
    deleteOpen,
    setDeleteOpen,
    shareOpen,
    setShareOpen,
    setJustSubmitted,
    workforce,
    setWorkforce,
    equipment,
    setEquipment,
    materials,
    setMaterials,
    progress,
    setProgress,
    visitors,
    setVisitors,
    meetings,
    setMeetings,
    syncing,
    copying,
    fetchingWeather,
    weatherNonce,
    saveField,
    handleCopyFromPrevious,
    handleSyncFromProgram,
    handleFetchWeather,
    sectionStatus,
    statusMutation,
    deleteMutation,
  } = useDailyReportState({ id, reportId });

  const filledCount = Object.values(sectionStatus).filter(Boolean).length;
  const totalCount = SECTIONS.length;
  const progressPct = Math.round((filledCount / totalCount) * 100);

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm text-muted-foreground">Report not found.</p>
        <Link
          href={`/projects/${id}/workflow/reports`}
          className="mt-4 inline-block text-xs text-primary underline"
        >
          Back to Reports
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col -m-4 md:-m-6">
      {/* Top Workspace Header */}
      <DailyReportHeader
        id={id}
        reportId={reportId}
        report={report}
        canEdit={canEdit}
        isAdmin={isAdmin}
        canDelete={canDelete}
        saving={saving}
        lastSaved={lastSaved}
        statusMutation={statusMutation}
        deleteMutation={deleteMutation}
        deleteOpen={deleteOpen}
        setDeleteOpen={setDeleteOpen}
        setShareOpen={setShareOpen}
      />

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <DailyReportSidebar
          sections={SECTIONS}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          sectionStatus={sectionStatus}
          progressPct={progressPct}
          filledCount={filledCount}
          totalCount={totalCount}
        />

        {/* Active Section Container */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-background">
          <div className="max-w-5xl mx-auto space-y-4">
            {/* Mobile section picker */}
            <div className="md:hidden">
              <Select value={activeSection} onValueChange={setActiveSection}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTIONS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 1. WEATHER */}
            {activeSection === "weather" && (
              <WeatherSection
                report={report}
                canEdit={canEdit}
                weatherNonce={weatherNonce}
                fetchingWeather={fetchingWeather}
                onFetchWeather={handleFetchWeather}
                saveField={saveField}
              />
            )}

            {/* 2. PLAN VS ACTUAL (PROGRESS) */}
            {activeSection === "progress" && (
              <ProgressSection
                projectId={id}
                progress={progress}
                setProgress={setProgress}
                canEdit={canEdit}
                syncing={syncing}
                onSyncFromProgram={handleSyncFromProgram}
                saveField={saveField}
              />
            )}

            {/* 3. WORKFORCE */}
            {activeSection === "workforce" && (
              <WorkforceSection
                workforce={workforce}
                setWorkforce={setWorkforce}
                canEdit={canEdit}
                copying={copying}
                onCopyFromPrevious={handleCopyFromPrevious}
                saveField={saveField}
              />
            )}

            {/* 4. EQUIPMENT */}
            {activeSection === "equipment" && (
              <EquipmentSection
                equipment={equipment}
                setEquipment={setEquipment}
                canEdit={canEdit}
                copying={copying}
                onCopyFromPrevious={handleCopyFromPrevious}
                saveField={saveField}
              />
            )}

            {/* 5. MATERIALS RECEIVED */}
            {activeSection === "materials" && (
              <MaterialsSection
                materials={materials}
                setMaterials={setMaterials}
                canEdit={canEdit}
                saveField={saveField}
              />
            )}

            {/* 6. SITE PHOTOS */}
            {activeSection === "photos" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Camera className="h-4 w-4 text-success" /> Site Progress Photos &
                    Attachments
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {report.attachments?.length ?? 0} photos attached
                  </span>
                </div>
                <PhotoSection
                  reportId={reportId}
                  attachments={(report.attachments || []) as any}
                  isWriter={canEdit}
                />
              </div>
            )}

            {/* 7. VISITORS */}
            {activeSection === "visitors" && (
              <VisitorsSection
                visitors={visitors}
                setVisitors={setVisitors}
                canEdit={canEdit}
                saveField={saveField}
              />
            )}

            {/* 8. MEETINGS */}
            {activeSection === "meetings" && (
              <MeetingsSection
                meetings={meetings}
                setMeetings={setMeetings}
                canEdit={canEdit}
                saveField={saveField}
              />
            )}

            {/* 9. PROBLEMS & DELAYS */}
            {activeSection === "problems" && (
              <ProblemsSection
                report={report}
                canEdit={canEdit}
                saveField={saveField}
              />
            )}

            {/* 10. SAFETY */}
            {activeSection === "safety" && (
              <SafetySection
                report={report}
                canEdit={canEdit}
                saveField={saveField}
              />
            )}

            {/* 11. REMARKS & DOCUMENT TRAIL */}
            {activeSection === "remarks" && (
              <RemarksSection
                report={report}
                reportId={reportId}
                projectId={id}
                canEdit={canEdit}
                saveField={saveField}
              />
            )}
          </div>
        </main>
      </div>

      {/* Share dialog */}
      <ShareReportDialog
        open={shareOpen}
        onOpenChange={(o) => {
          setShareOpen(o);
          if (!o) setJustSubmitted(false);
        }}
        report={report as any}
        clientName={projectInfo?.project?.client ?? undefined}
      />
    </div>
  );
}
