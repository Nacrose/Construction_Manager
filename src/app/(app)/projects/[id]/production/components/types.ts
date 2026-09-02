import { Factory, Flame, Layers, Sliders } from "lucide-react";

export const RES_TABS = [
  { label: "Materials & Procurement", href: "/materials" },
  { label: "Resource & Rate Library", href: "/rate-library" },
  { label: "Equipment & Fleet", href: "/equipment" },
  { label: "Plant & Production", href: "/production" },
  { label: "Subcontractors", href: "/subcontractors" },
  { label: "HR / Staff", href: "/hr" },
  { label: "Vendors Directory", href: "/vendors" },
];

export const TICKET_STATUS_STYLES: Record<string, string> = {
  dispatched: "bg-info/15 text-info dark:bg-[var(--navy-deep)] dark:text-info/80",
  in_transit: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  cancelled: "bg-muted text-muted-foreground dark:bg-[var(--navy-mid)] dark:text-muted-foreground/80",
};

export const PLANT_TYPE_LABELS: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  concrete_batching: {
    label: "Concrete Batching Plant",
    icon: Factory,
    color: "text-info dark:text-info/80",
  },
  asphalt_hot_mix: {
    label: "Asphalt Hot Mix Plant",
    icon: Flame,
    color: "text-amber-600 dark:text-amber-400",
  },
  wmm_wet_mix: {
    label: "Wet Mix Macadam (WMM)",
    icon: Layers,
    color: "text-emerald-600 dark:text-emerald-400",
  },
  crusher: {
    label: "Aggregate Crusher Plant",
    icon: Sliders,
    color: "text-purple-600 dark:text-purple-400",
  },
};
