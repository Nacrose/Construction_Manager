/**
 * Standard Civil Engineering Work Package Templates catalog and generator.
 * Provides pre-engineered task hierarchies with calibrated durations,
 * standard dependency chains, and task types (e.g. curing elapsed days).
 */

export type TemplateSubtask = {
  tempId: string; // "1", "2", "3"
  name: string;
  duration: number; // days
  taskType?: string; // "fixed_duration" | "elapsed_curing" | "continuous_24_7" | "risk_buffer"
  laborCount?: number;
  isMilestone?: boolean;
  predecessorTempIds?: Array<{
    tempId: string;
    type: "FS" | "SS" | "FF" | "SF";
    offset: number;
  }>;
};

export type WorkPackageTemplateDef = {
  id: string;
  name: string;
  category: "structures" | "bridges" | "highways" | "buildings" | "custom";
  categoryLabel: string;
  description: string;
  tags: string[];
  totalDurationDays: number;
  subtaskCount: number;
  subtasks: TemplateSubtask[];
};

export const BUILT_IN_TEMPLATES: WorkPackageTemplateDef[] = [
  {
    id: "builtin-dor-box-culvert-2cell",
    name: "DoR Standard Double Cell Box Culvert",
    category: "structures",
    categoryLabel: "Cross Drainage & Retaining",
    description: "Standard Department of Roads (DoR) 2-cell RCC box culvert sequence including bedding, raft, wall haunches, top slab, mandatory 14-day curing lag, and granular backfill.",
    tags: ["Highway", "Structures", "DoR Norms", "RCC"],
    totalDurationDays: 33,
    subtaskCount: 8,
    subtasks: [
      {
        tempId: "1",
        name: "Excavation & Foundation Bed Preparation",
        duration: 5,
        laborCount: 8,
        taskType: "fixed_duration",
      },
      {
        tempId: "2",
        name: "PCC 1:3:6 Bedding Concrete (100mm)",
        duration: 2,
        laborCount: 6,
        taskType: "fixed_duration",
        predecessorTempIds: [{ tempId: "1", type: "FS", offset: 0 }],
      },
      {
        tempId: "3",
        name: "Bottom Raft Reinforcement & M25 Concreting",
        duration: 4,
        laborCount: 12,
        taskType: "fixed_duration",
        predecessorTempIds: [{ tempId: "2", type: "FS", offset: 0 }],
      },
      {
        tempId: "4",
        name: "Curing Bottom Slab (Mandatory)",
        duration: 7,
        laborCount: 1,
        taskType: "elapsed_curing",
        predecessorTempIds: [{ tempId: "3", type: "FS", offset: 0 }],
      },
      {
        tempId: "5",
        name: "Wall & Haunch Formwork, Rebar & M25 Pour",
        duration: 6,
        laborCount: 14,
        taskType: "fixed_duration",
        predecessorTempIds: [{ tempId: "4", type: "FS", offset: 0 }],
      },
      {
        tempId: "6",
        name: "Top Deck Slab Shuttering, Rebar & M25 Concreting",
        duration: 5,
        laborCount: 15,
        taskType: "fixed_duration",
        predecessorTempIds: [{ tempId: "5", type: "FS", offset: 0 }],
      },
      {
        tempId: "7",
        name: "Deck Slab Curing & Deshuttering (14 Days)",
        duration: 14,
        laborCount: 1,
        taskType: "elapsed_curing",
        predecessorTempIds: [{ tempId: "6", type: "FS", offset: 0 }],
      },
      {
        tempId: "8",
        name: "Filter Backfilling & Granular Compaction",
        duration: 4,
        laborCount: 6,
        taskType: "fixed_duration",
        predecessorTempIds: [{ tempId: "7", type: "FS", offset: 0 }],
      },
    ],
  },
  {
    id: "builtin-single-box-culvert",
    name: "Standard Single Cell Box Culvert",
    category: "structures",
    categoryLabel: "Cross Drainage & Retaining",
    description: "Compact single cell RCC box culvert for secondary cross-drainage channels with complete subtask sequence.",
    tags: ["Drainage", "Structures", "RCC"],
    totalDurationDays: 24,
    subtaskCount: 7,
    subtasks: [
      {
        tempId: "1",
        name: "Trench Excavation & Dewatering",
        duration: 3,
        laborCount: 6,
      },
      {
        tempId: "2",
        name: "PCC 1:3:6 Levelling Course",
        duration: 2,
        laborCount: 4,
        predecessorTempIds: [{ tempId: "1", type: "FS", offset: 0 }],
      },
      {
        tempId: "3",
        name: "Invert Raft Slab Rebar & Concreting M25",
        duration: 3,
        laborCount: 10,
        predecessorTempIds: [{ tempId: "2", type: "FS", offset: 0 }],
      },
      {
        tempId: "4",
        name: "Raft Curing Period",
        duration: 5,
        laborCount: 1,
        taskType: "elapsed_curing",
        predecessorTempIds: [{ tempId: "3", type: "FS", offset: 0 }],
      },
      {
        tempId: "5",
        name: "Abutment Walls & Haunches Concreting",
        duration: 5,
        laborCount: 10,
        predecessorTempIds: [{ tempId: "4", type: "FS", offset: 0 }],
      },
      {
        tempId: "6",
        name: "Top Deck Slab Concreting & Curing (10d)",
        duration: 10,
        laborCount: 12,
        taskType: "elapsed_curing",
        predecessorTempIds: [{ tempId: "5", type: "FS", offset: 0 }],
      },
      {
        tempId: "7",
        name: "Weep Holes & Granular Backfill",
        duration: 3,
        laborCount: 5,
        predecessorTempIds: [{ tempId: "6", type: "FS", offset: 0 }],
      },
    ],
  },
  {
    id: "builtin-pipe-culvert-900mm",
    name: "NP3/NP4 Concrete Pipe Culvert (900mm Dia)",
    category: "structures",
    categoryLabel: "Cross Drainage & Retaining",
    description: "Precast reinforced concrete pipe culvert installation with stone masonry headwalls and apron.",
    tags: ["Highway", "Pipe Culvert", "DoR Standard"],
    totalDurationDays: 10,
    subtaskCount: 5,
    subtasks: [
      {
        tempId: "1",
        name: "Excavation for Pipe Cradle & Apron",
        duration: 2,
        laborCount: 5,
      },
      {
        tempId: "2",
        name: "Granular Bedding / PCC Cradle 1:3:6",
        duration: 2,
        laborCount: 4,
        predecessorTempIds: [{ tempId: "1", type: "FS", offset: 0 }],
      },
      {
        tempId: "3",
        name: "NP3/NP4 Pipe Laying, Alignment & Joint Mortar",
        duration: 2,
        laborCount: 6,
        predecessorTempIds: [{ tempId: "2", type: "FS", offset: 0 }],
      },
      {
        tempId: "4",
        name: "Stone Masonry Headwalls, Wingwalls & Apron",
        duration: 4,
        laborCount: 8,
        predecessorTempIds: [{ tempId: "3", type: "FS", offset: 0 }],
      },
      {
        tempId: "5",
        name: "Cushion Backfill & Compaction above Pipe",
        duration: 2,
        laborCount: 4,
        predecessorTempIds: [{ tempId: "4", type: "FS", offset: 0 }],
      },
    ],
  },
  {
    id: "builtin-gabion-wall-5m",
    name: "Gabion Retaining Wall (5m Height / 30m Length)",
    category: "structures",
    categoryLabel: "Cross Drainage & Retaining",
    description: "Standard stepped wire-mesh gabion retaining wall with geotextile filter fabric and boulder packing.",
    tags: ["Slope Protection", "Gabion", "Retaining Wall"],
    totalDurationDays: 18,
    subtaskCount: 5,
    subtasks: [
      {
        tempId: "1",
        name: "Foundation Trench Excavation & Dressing",
        duration: 4,
        laborCount: 8,
      },
      {
        tempId: "2",
        name: "Non-Woven Geotextile Membrane Laying",
        duration: 2,
        laborCount: 4,
        predecessorTempIds: [{ tempId: "1", type: "FS", offset: 0 }],
      },
      {
        tempId: "3",
        name: "Tier 1 & 2 (Base) Gabion Boxes Hand-Packing",
        duration: 6,
        laborCount: 14,
        predecessorTempIds: [{ tempId: "2", type: "FS", offset: 0 }],
      },
      {
        tempId: "4",
        name: "Upper Tiers Gabion Crates Packing & Lacing",
        duration: 6,
        laborCount: 14,
        predecessorTempIds: [{ tempId: "3", type: "FS", offset: 0 }],
      },
      {
        tempId: "5",
        name: "Drainage Layer Filter Stone Backfilling",
        duration: 3,
        laborCount: 6,
        predecessorTempIds: [{ tempId: "4", type: "SS", offset: 2 }],
      },
    ],
  },
  {
    id: "builtin-bored-pile-group",
    name: "Bored Cast-in-Situ Pile Group (4x1.2m Dia, 25m)",
    category: "bridges",
    categoryLabel: "Bridges & Foundations",
    description: "Deep foundation bored piling cycle for bridge pier or heavy abutment with 24/7 continuous drilling & tremie pour.",
    tags: ["Bridges", "Piling", "Foundation", "24/7"],
    totalDurationDays: 16,
    subtaskCount: 5,
    subtasks: [
      {
        tempId: "1",
        name: "Platform Prep, Guide Wall & Rig Setup",
        duration: 3,
        laborCount: 6,
      },
      {
        tempId: "2",
        name: "Bored Rotary Drilling & Bentonite Circulation",
        duration: 6,
        laborCount: 8,
        taskType: "continuous_24_7",
        predecessorTempIds: [{ tempId: "1", type: "FS", offset: 0 }],
      },
      {
        tempId: "3",
        name: "Rebar Cage Lowering & Sonic Logging Tubes",
        duration: 2,
        laborCount: 10,
        predecessorTempIds: [{ tempId: "2", type: "FS", offset: 0 }],
      },
      {
        tempId: "4",
        name: "Tremie Pipe Concreting M35 (Continuous Pour)",
        duration: 2,
        laborCount: 12,
        taskType: "continuous_24_7",
        predecessorTempIds: [{ tempId: "3", type: "FS", offset: 0 }],
      },
      {
        tempId: "5",
        name: "Pile Head Chipping & Cross-Hole Sonic Logging",
        duration: 4,
        laborCount: 6,
        predecessorTempIds: [{ tempId: "4", type: "FS", offset: 3 }],
      },
    ],
  },
  {
    id: "builtin-psc-girder-30m",
    name: "30m PSC Precast Girder Casting & Launching",
    category: "bridges",
    categoryLabel: "Bridges & Foundations",
    description: "Post-tensioned precast concrete I-girder casting, wet curing, stress post-tensioning, and crane/gantry launching for a 30m bridge span.",
    tags: ["Bridges", "Prestressed", "Superstructure"],
    totalDurationDays: 28,
    subtaskCount: 6,
    subtasks: [
      {
        tempId: "1",
        name: "Casting Yard Bed Setup & Steel Formwork Assembly",
        duration: 4,
        laborCount: 8,
      },
      {
        tempId: "2",
        name: "Rebar Cage & High-Tensile Sheathing Duct Placement",
        duration: 5,
        laborCount: 12,
        predecessorTempIds: [{ tempId: "1", type: "FS", offset: 0 }],
      },
      {
        tempId: "3",
        name: "High Performance Concreting M45 / M50 Pour",
        duration: 2,
        laborCount: 14,
        predecessorTempIds: [{ tempId: "2", type: "FS", offset: 0 }],
      },
      {
        tempId: "4",
        name: "Steam / Wet Curing to Reach 85% Compressive Strength",
        duration: 10,
        laborCount: 2,
        taskType: "elapsed_curing",
        predecessorTempIds: [{ tempId: "3", type: "FS", offset: 0 }],
      },
      {
        tempId: "5",
        name: "Prestressing Strand Tensioning & Duct Grouting",
        duration: 3,
        laborCount: 8,
        predecessorTempIds: [{ tempId: "4", type: "FS", offset: 0 }],
      },
      {
        tempId: "6",
        name: "Girder Transport & Gantry Crane Launching onto Bearings",
        duration: 4,
        laborCount: 16,
        predecessorTempIds: [{ tempId: "5", type: "FS", offset: 1 }],
      },
    ],
  },
  {
    id: "builtin-1km-pavement-cycle",
    name: "1 km Highway Pavement Package (GSB + WMM + Asphalt)",
    category: "highways",
    categoryLabel: "Roadway & Pavement",
    description: "Sequential road pavement construction including Subgrade, Granular Sub-base (GSB), Wet Mix Macadam (WMM), Prime Coat, DBM, and Asphalt Concrete.",
    tags: ["Highway", "Pavement", "Asphalt", "DoR Specs"],
    totalDurationDays: 30,
    subtaskCount: 6,
    subtasks: [
      {
        tempId: "1",
        name: "Subgrade Dressing & 98% Heavy Compaction",
        duration: 5,
        laborCount: 6,
      },
      {
        tempId: "2",
        name: "Granular Sub-Base (GSB) 200mm Layer",
        duration: 6,
        laborCount: 8,
        predecessorTempIds: [{ tempId: "1", type: "FS", offset: 0 }],
      },
      {
        tempId: "3",
        name: "Wet Mix Macadam (WMM) 150mm Base Course",
        duration: 6,
        laborCount: 10,
        predecessorTempIds: [{ tempId: "2", type: "FS", offset: 0 }],
      },
      {
        tempId: "4",
        name: "Prime Coat Bitumen Application (SS-1 / MC-30)",
        duration: 2,
        laborCount: 4,
        predecessorTempIds: [{ tempId: "3", type: "FS", offset: 1 }],
      },
      {
        tempId: "5",
        name: "Dense Bituminous Macadam (DBM) 60mm Layer",
        duration: 4,
        laborCount: 12,
        predecessorTempIds: [{ tempId: "4", type: "FS", offset: 1 }],
      },
      {
        tempId: "6",
        name: "Tack Coat & Asphalt Concrete (AC) 40mm Wearing Course",
        duration: 4,
        laborCount: 12,
        predecessorTempIds: [{ tempId: "5", type: "FS", offset: 0 }],
      },
    ],
  },
  {
    id: "builtin-floor-slab-cycle",
    name: "Typical Building Floor Cycle (Column + Beam + Slab)",
    category: "buildings",
    categoryLabel: "Building Cycles",
    description: "Standard 14-day repetitive structural floor slab cycle for commercial or institutional multi-story construction.",
    tags: ["Building", "High Rise", "RCC Slab", "Cycle"],
    totalDurationDays: 14,
    subtaskCount: 6,
    subtasks: [
      {
        tempId: "1",
        name: "Column Rebar Tying & Starter Shuttering",
        duration: 3,
        laborCount: 10,
      },
      {
        tempId: "2",
        name: "Column Concreting M25 & Deshuttering",
        duration: 2,
        laborCount: 8,
        predecessorTempIds: [{ tempId: "1", type: "FS", offset: 0 }],
      },
      {
        tempId: "3",
        name: "Soffit Scaffolding & Beam-Slab Formwork",
        duration: 4,
        laborCount: 12,
        predecessorTempIds: [{ tempId: "2", type: "FS", offset: 0 }],
      },
      {
        tempId: "4",
        name: "Beam-Slab Rebar & Electrical/Plumbing Conduits",
        duration: 3,
        laborCount: 14,
        predecessorTempIds: [{ tempId: "3", type: "FS", offset: 0 }],
      },
      {
        tempId: "5",
        name: "Slab & Beam Concreting M25 (Monolithic Pour)",
        duration: 1,
        laborCount: 16,
        predecessorTempIds: [{ tempId: "4", type: "FS", offset: 0 }],
      },
      {
        tempId: "6",
        name: "Continuous Water Curing & Staged Deshuttering",
        duration: 7,
        laborCount: 2,
        taskType: "elapsed_curing",
        predecessorTempIds: [{ tempId: "5", type: "FS", offset: 0 }],
      },
    ],
  },
];
