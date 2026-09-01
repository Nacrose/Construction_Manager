import { Factory, Flame, Layers, Sliders } from "lucide-react";


export const TICKET_STATUS_STYLES: Record<string, string> = {
  dispatched: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  in_transit: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export const PLANT_TYPE_LABELS: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  concrete_batching: {
    label: "Concrete Batching Plant",
    icon: Factory,
    color: "text-blue-600 dark:text-blue-400",
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
