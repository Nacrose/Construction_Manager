"use client";

import { use } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "RFIs", href: "/rfi" },
  { label: "Daily Program", href: "/program" },
  { label: "My Tasks", href: "/program/my-tasks" },
  { label: "Daily Reports", href: "/reports" },
  { label: "Correspondence", href: "/correspondence", absolute: true },
  { label: "Meetings", href: "/meetings", absolute: true },
];

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
          const href = (tab as any).absolute
            ? `/projects/${id}${tab.href}`
            : basePath + tab.href;
          // Unify the active-tab detection: always use startsWith so that
          // detail/sub pages (e.g. /workflow/rfi/[rfiId]/...) correctly
          // highlight their parent tab. Previously the RFI tab was
          // special-cased to use exact-match (`pathname === href`), which
          // meant visiting an RFI detail page left the RFIs tab
          // unhighlighted.
          const tabPath = (tab as any).absolute
            ? `/projects/${id}${tab.href}`
            : basePath + tab.href;
          const active =
            tabPath === `${basePath}/rfi`
              ? pathname === tabPath || pathname.startsWith(`${tabPath}/`)
              : pathname === tabPath || pathname.startsWith(`${tabPath}/`);
          return (
            <Link
              key={tab.href}
              href={href}
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
