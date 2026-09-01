"use client";

import { use } from "react";
import { trpc } from "@/lib/trpc-client";
import { AnimatedPage } from "@/components/ui/animated-page";
import { ModuleTabs } from "@/components/module-tabs";
import { PayrollManagementTab } from "../components/payroll-management-tab";

const RES_TABS = [
  { label: "Materials & Procurement", href: "/materials" },
  { label: "Resource & Rate Library", href: "/rate-library" },
  { label: "Equipment & Fleet", href: "/equipment" },
  { label: "Plant & Production", href: "/production" },
  { label: "Subcontractors", href: "/subcontractors" },
  { label: "HR / Staff", href: "/hr" },
  { label: "Vendors Directory", href: "/vendors" },
];

export default function PayrollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const isAdmin =
    projectInfo?.myRole === "project_manager" || projectInfo?.myRole === "coordinator";

  return (
    <>
      <ModuleTabs projectId={id} tabs={RES_TABS} />
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
