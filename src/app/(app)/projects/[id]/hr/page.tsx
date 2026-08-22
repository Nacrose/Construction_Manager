"use client";

import { use, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { AnimatedPage } from "@/components/ui/animated-page";
import { ModuleTabs } from "@/components/module-tabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  CalendarCheck,
  FileSpreadsheet,
  Banknote,
  Calculator,
  Calendar,
  Layers,
} from "lucide-react";
import { StaffDirectoryTab } from "./components/staff-directory-tab";
import { DailyAttendanceTab } from "./components/daily-attendance-tab";
import { MusterRollTab } from "./components/muster-roll-tab";
import { AdvancesLedgerTab } from "./components/advances-ledger-tab";
import { PayrollManagementTab } from "./components/payroll-management-tab";
import { LeavesTab } from "./components/leaves-tab";
import { StaffRolesTab } from "./staff-roles-tab";

const RES_TABS = [
  { label: "Materials & Procurement", href: "/materials" },
  { label: "Resource & Rate Library", href: "/rate-library" },
  { label: "Equipment & Fleet", href: "/equipment" },
  { label: "Plant & Production", href: "/production" },
  { label: "Subcontractors", href: "/subcontractors" },
  { label: "HR / Staff", href: "/hr" },
  { label: "Vendors Directory", href: "/vendors" },
];

export default function HrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState<string>("directory");

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data: staffData } = trpc.hr.list.useQuery({
    projectId: id,
    tab: "staff",
    status: "active",
  });

  const canWrite = Boolean(
    projectInfo?.myRole &&
      projectInfo.myRole !== "client" &&
      projectInfo.myRole !== "inspector"
  );
  const isAdmin =
    projectInfo?.myRole === "project_manager" || projectInfo?.myRole === "coordinator";

  const staffList = staffData?.staff || [];

  return (
    <>
      <ModuleTabs projectId={id} tabs={RES_TABS} />
      <AnimatedPage className="space-y-4 pb-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-sky-500" />
              Workforce &amp; HR Management
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage site labor gangs, high-speed daily attendance, 31-day muster rolls, advances, and payroll.
            </p>
          </div>
        </div>

        {/* Unified Tab Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 sm:grid-cols-7 w-full mb-4">
            <TabsTrigger value="directory" className="text-xs gap-1.5">
              <Users className="h-3.5 w-3.5" /> Roster
            </TabsTrigger>
            <TabsTrigger value="daily_attendance" className="text-xs gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5" /> Daily Muster
            </TabsTrigger>
            <TabsTrigger value="muster_roll" className="text-xs gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5" /> 31-Day Grid
            </TabsTrigger>
            <TabsTrigger value="advances" className="text-xs gap-1.5">
              <Banknote className="h-3.5 w-3.5" /> Advances
            </TabsTrigger>
            <TabsTrigger value="payroll" className="text-xs gap-1.5">
              <Calculator className="h-3.5 w-3.5" /> Payroll
            </TabsTrigger>
            <TabsTrigger value="leaves" className="text-xs gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Leaves
            </TabsTrigger>
            <TabsTrigger value="roles" className="text-xs gap-1.5">
              <Layers className="h-3.5 w-3.5" /> Chainage Roles
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: WORKFORCE ROSTER & GANGS */}
          <TabsContent value="directory" className="space-y-4 m-0">
            <StaffDirectoryTab projectId={id} canWrite={canWrite} />
          </TabsContent>

          {/* TAB 2: DAILY SITE ATTENDANCE */}
          <TabsContent value="daily_attendance" className="space-y-4 m-0">
            <DailyAttendanceTab projectId={id} />
          </TabsContent>

          {/* TAB 3: 31-DAY MUSTER ROLL MATRIX */}
          <TabsContent value="muster_roll" className="space-y-4 m-0">
            <MusterRollTab projectId={id} />
          </TabsContent>

          {/* TAB 4: ADVANCES & MESS DEDUCTIONS */}
          <TabsContent value="advances" className="space-y-4 m-0">
            <AdvancesLedgerTab projectId={id} staffList={staffList} />
          </TabsContent>

          {/* TAB 5: PAYROLL & PAYSLIPS */}
          <TabsContent value="payroll" className="space-y-4 m-0">
            <PayrollManagementTab projectId={id} isAdmin={isAdmin} />
          </TabsContent>

          {/* TAB 6: LEAVE MANAGEMENT */}
          <TabsContent value="leaves" className="space-y-4 m-0">
            <LeavesTab
              projectId={id}
              staffList={staffList}
              isAdmin={isAdmin}
              canWrite={canWrite}
            />
          </TabsContent>

          {/* TAB 7: LINEAR CHAINAGE ROLES */}
          <TabsContent value="roles" className="space-y-4 m-0">
            <StaffRolesTab projectId={id} canWrite={canWrite} />
          </TabsContent>
        </Tabs>
      </AnimatedPage>
    </>
  );
}
