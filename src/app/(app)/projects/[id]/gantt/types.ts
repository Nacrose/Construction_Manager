export type Ingredient = {
  id: string;
  name: string;
  type: string;
  calcMode: string;
  quantity: number;
  unit: string;
  percentage: number;
  pctBase: string;
  rate: number;
  amount: number;
};

export type BoqItemRef = {
  id: string;
  code: string;
  description: string;
  unit: string;
  rate: number;
  ingredients: Ingredient[];
  rateAnalyses?: {
    id: string;
    libraryId: string | null;
    name: string;
    batchSize: number;
    isDefault: boolean;
    library: { id: string; purpose: string; name: string } | null;
    ingredients: Ingredient[];
  }[];
};

export type TaskBoqLink = {
  id: string;
  taskId: string;
  boqItemId: string;
  quantity: number;
  boqItem: BoqItemRef;
};

export type Dependency = { taskId: string; type: "FS" | "SS" | "FF" | "SF"; offset: number };

export type Task = {
  id: string;
  parentId: string | null;
  code: string | null;
  name: string;
  startDate: string;
  endDate: string;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  duration: number;
  progress: number;
  baseProgress?: number | null;
  isProgressEdited?: boolean;
  plannedValue: number;
  laborCount: number;
  isMilestone: boolean;
  sortOrder: number;
  boqLinks: TaskBoqLink[];
  predecessors?: { id: string; predecessorId: string; type: string; offset: number }[];
  dependencies: string | null;
  taskType?: string | null;
  notes?: string | null;
  workHours?: number | null;
  estimated?: boolean | null;
  ignoreResourceCalendar?: boolean | null;
};

export type ZoomLevel = "day" | "week" | "month";
