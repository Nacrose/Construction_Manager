"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Check,
  Coins,
  ShieldCheck,
  PlayCircle,
  StopCircle,
} from "lucide-react";

export type EntityLifecycleStatus =
  | "draft"
  | "submitted"
  | "pending"
  | "checked"
  | "verified"
  | "approved"
  | "rejected"
  | "cancelled"
  | "active"
  | "in_progress"
  | "completed"
  | "partially_paid"
  | "paid"
  | "settled"
  | "overdue"
  | string;

interface StatusConfig {
  label: string;
  labelNp: string;
  className: string;
  icon: React.ComponentType<{ className?: string }>;
}

const statusMap: Record<string, StatusConfig> = {
  draft: {
    label: "Draft",
    labelNp: "मस्यौदा",
    className: "bg-slate-500/10 text-slate-300 border-slate-500/30",
    icon: FileText,
  },
  submitted: {
    label: "Submitted",
    labelNp: "पेश गरिएको",
    className: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    icon: Clock,
  },
  pending: {
    label: "Pending",
    labelNp: "विचाराधीन",
    className: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    icon: Clock,
  },
  checked: {
    label: "Checked",
    labelNp: "जाँच गरिएको",
    className: "bg-sky-500/10 text-sky-300 border-sky-500/30",
    icon: ShieldCheck,
  },
  verified: {
    label: "Verified",
    labelNp: "प्रमाणित",
    className: "bg-sky-500/10 text-sky-300 border-sky-500/30",
    icon: ShieldCheck,
  },
  approved: {
    label: "Approved",
    labelNp: "स्वीकृत",
    className: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    icon: CheckCircle2,
  },
  active: {
    label: "Active",
    labelNp: "सक्रिय",
    className: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    icon: PlayCircle,
  },
  in_progress: {
    label: "In Progress",
    labelNp: "प्रगतिमा",
    className: "bg-blue-500/10 text-blue-300 border-blue-500/30",
    icon: PlayCircle,
  },
  rejected: {
    label: "Rejected",
    labelNp: "अस्वीकृत",
    className: "bg-red-500/10 text-red-400 border-red-500/30",
    icon: XCircle,
  },
  cancelled: {
    label: "Cancelled",
    labelNp: "रद्द गरिएको",
    className: "bg-red-500/10 text-red-400 border-red-500/30",
    icon: StopCircle,
  },
  partially_paid: {
    label: "Partially Paid",
    labelNp: "आंशिक भुक्तानी",
    className: "bg-blue-500/10 text-blue-300 border-blue-500/30",
    icon: Coins,
  },
  paid: {
    label: "Paid",
    labelNp: "भुक्तानी सम्पन्न",
    className: "bg-purple-500/10 text-purple-300 border-purple-500/30",
    icon: Check,
  },
  settled: {
    label: "Settled",
    labelNp: "चुक्ता",
    className: "bg-purple-500/10 text-purple-300 border-purple-500/30",
    icon: Check,
  },
  completed: {
    label: "Completed",
    labelNp: "सम्पन्न",
    className: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    icon: CheckCircle2,
  },
  overdue: {
    label: "Overdue",
    labelNp: "म्याद नाघेको",
    className: "bg-rose-500/15 text-rose-300 border-rose-500/40 animate-pulse",
    icon: AlertCircle,
  },
};

export interface StatusBadgeProps {
  status?: EntityLifecycleStatus | null;
  size?: "xs" | "sm" | "md";
  showNepali?: boolean;
  showIcon?: boolean;
  customLabel?: string;
  label?: string;
  className?: string;
}

export function StatusBadge({
  status,
  size = "sm",
  showNepali = false,
  showIcon = true,
  customLabel,
  label,
  className,
}: StatusBadgeProps) {
  const effectiveLabel = label || customLabel;
  const normStatus = (status || "draft").toLowerCase().trim();
  const config = statusMap[normStatus] || {
    label: effectiveLabel || normStatus.replace(/_/g, " "),
    labelNp: "",
    className: "bg-gray-500/10 text-gray-300 border-gray-500/30",
    icon: FileText,
  };

  const IconComponent = config.icon;

  const sizeClasses = {
    xs: "text-[9px] px-1.5 py-0 h-4 gap-1",
    sm: "text-[10px] px-2 py-0.5 h-5 gap-1.5 font-mono",
    md: "text-xs px-2.5 py-1 h-6 gap-2 font-mono",
  }[size];

  const iconSizes = {
    xs: "h-2.5 w-2.5",
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
  }[size];

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center font-medium capitalize border transition-all select-none",
        sizeClasses,
        config.className,
        className
      )}
    >
      {showIcon && <IconComponent className={iconSizes} />}
      <span>{customLabel || config.label}</span>
      {showNepali && config.labelNp && (
        <span className="opacity-75 text-[85%]">({config.labelNp})</span>
      )}
    </Badge>
  );
}
