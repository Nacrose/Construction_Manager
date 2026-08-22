"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  LayoutDashboard, Building2, Users, History,
  Database, Settings, HardDrive, ShieldAlert,
  BookOpen,
} from "lucide-react";
import { getUser } from "@/lib/client-auth";
import { cn } from "@/lib/utils";

const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
    ],
  },
  {
    label: "Management",
    items: [
      { label: "Organizations", href: "/admin/organizations", icon: Building2 },
      { label: "Users", href: "/admin/users", icon: Users },
    ],
  },
  {
    label: "Catalogs",
    items: [
      { label: "Rate Catalogs", href: "/admin/rate-catalogs", icon: BookOpen },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Audit Log", href: "/admin/audit", icon: History },
      { label: "Database", href: "/admin/database", icon: HardDrive },
      { label: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const u = getUser();
    if (!u?.isSuperAdmin) {
      router.replace("/dashboard");
    }
  }, [router]);

  const u = getUser();
  if (!u?.isSuperAdmin) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Redirecting…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-56 shrink-0 border-r bg-muted/30 p-3">
        <div className="mb-4 flex items-center gap-2 px-2 text-sm font-semibold">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          Platform Admin
        </div>
        <nav className="space-y-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <div className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {section.label}
              </div>
              {section.items.map((item) => {
                const active =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
