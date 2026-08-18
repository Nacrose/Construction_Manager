"use client";

import { use } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "RFIs", href: "/rfi" },
  { label: "Daily Program", href: "/program" },
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
  const basePath = `/projects/${id}/workflow`;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => {
          const href = (tab as any).absolute
            ? `/projects/${id}${tab.href}`
            : basePath + tab.href;
          const active = (tab as any).absolute
            ? pathname === `/projects/${id}${tab.href}` || pathname.startsWith(`/projects/${id}${tab.href}/`)
            : tab.href === "/rfi"
              ? pathname === href
              : pathname.startsWith(href);
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
