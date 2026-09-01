"use client";

import { use } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { NAV_CLUSTERS } from "@/lib/nav-registry";

// Tab data lives in the nav registry ("workflow-shell" cluster) —
// single source of truth shared with ModuleTabs consumers.
const TABS = NAV_CLUSTERS["workflow-shell"];

export default function WorkflowLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const pathname = usePathname();
  const isPrintOrDesigner =
    pathname.includes("/pdf-designer") ||
    pathname.includes("/pdf-render") ||
    pathname.includes("/print");

  if (isPrintOrDesigner) {
    return <>{children}</>;
  }

  const basePath = `/projects/${id}/workflow`;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => {
          const tabPath = tab.absolute
            ? `/projects/${id}${tab.href}`
            : basePath + tab.href;
          // Unify the active-tab detection: always use startsWith so that
          // detail/sub pages (e.g. /workflow/rfi/[rfiId]/...) correctly
          // highlight their parent tab. Previously the RFI tab was
          // special-cased to use exact-match (`pathname === href`), which
          // meant visiting an RFI detail page left the RFIs tab
          // unhighlighted.
          const active =
            pathname === tabPath || pathname.startsWith(`${tabPath}/`);
          return (
            <Link
              key={tab.href}
              href={tabPath}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
