"use client";

import { use } from "react";
import { trpc } from "@/lib/trpc-client";
import { AnimatedPage } from "@/components/ui/animated-page";
import { ModuleTabs } from "@/components/module-tabs";
import { PayrollManagementTab } from "../components/payroll-management-tab";


export default function PayrollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const isAdmin =
    projectInfo?.myRole === "project_manager" || projectInfo?.myRole === "coordinator";

  return (
    <>
      <ModuleTabs projectId={id} cluster="resources" />
      <AnimatedPage className="space-y-4 pb-8">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h1 className="text-lg font-bold">Construction Payroll &amp; Wage Disbursals</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monthly wage calculation, advance deductions, mess recoveries, and printable worker payslips.
            </p>
          </div>
        </div>

        <PayrollManagementTab projectId={id} isAdmin={isAdmin} />
      </AnimatedPage>
    </>
  );
}
