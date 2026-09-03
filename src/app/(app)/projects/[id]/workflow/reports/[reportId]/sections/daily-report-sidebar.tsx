"use client";

import { cn } from "@/lib/utils";

export function DailyReportSidebar({
  sections,
  activeSection,
  setActiveSection,
  sectionStatus,
  progressPct,
  filledCount,
  totalCount,
}: {
  sections: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    field: string;
  }>;
  activeSection: string;
  setActiveSection: (val: string) => void;
  sectionStatus: Record<string, boolean | undefined>;
  progressPct: number;
  filledCount: number;
  totalCount: number;
}) {
  return (
    <aside className="hidden md:flex w-52 shrink-0 flex-col border-r border-border bg-muted/20 overflow-y-auto">
      <div className="p-2 space-y-0.5">
        {sections.map((s) => {
          const filled = sectionStatus[s.id];
          const active = activeSection === s.id;
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={cn(
                "flex items-center gap-2 w-full rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors text-left",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 truncate">{s.label}</span>
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full shrink-0",
                  filled ? "bg-success" : "bg-muted-foreground/30"
                )}
              />
            </button>
          );
        })}
      </div>

      {/* Progress summary card */}
      <div className="mt-auto border-t border-border p-3">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
          Completeness
        </p>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {filledCount}/{totalCount} sections filled ({progressPct}%)
        </p>
      </div>
    </aside>
  );
}
