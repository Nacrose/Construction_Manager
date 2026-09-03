export type Equipment = {
  id: string;
  name: string;
  code: string | null;
  type: string | null;
  model: string | null;
  status: string;
  fuelRate: number;
  factoryFuelRate: number;
  unit: string;
  _count: { logs: number; maintenance: number };
  currentMeter?: number;
  nextDueHours?: number | null;
  hoursUntilService?: number | null;
  isServiceDue?: boolean;
  isServiceOverdue?: boolean;
  dueServiceDescription?: string | null;
};

export type EquipmentLog = {
  id: string;
  equipmentId: string;
  date: Date;
  startHours: number;
  endHours: number;
  workedHours: number;
  fuelFilled: number;
  workDescription: string | null;
  operator: string | null;
  logMode: string;
  outputQty: number | null;
  outputUnit: string | null;
  tripCount: number | null;
  equipment: { name: string; code: string | null; unit: string };
  ganttTask: { id: string; name: string; code: string | null } | null;
  boqItem: { id: string; code: string; description: string; unit: string } | null;
};

export type Maintenance = {
  id: string;
  equipmentId: string;
  date: Date | null;
  type: string;
  cost: number;
  description: string | null;
  status: string;
  resolvedDate: Date | null;
  resolvedNotes: string | null;
  equipment: { name: string; code: string | null; type: string | null };
};

export const STATUS_STYLES: Record<string, string> = {
  active: "bg-success/15 text-success dark:bg-success dark:text-success/80",
  maintenance: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  breakdown: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  idle: "bg-muted text-muted-foreground dark:bg-[var(--navy-mid)] dark:text-muted-foreground/80",
};
