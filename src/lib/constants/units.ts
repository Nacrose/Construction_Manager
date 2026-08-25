export interface UnitOption {
  value: string;
  label: string;
  category: "Volume" | "Area" | "Length" | "Weight" | "Count & Packaging" | "Time & Other";
}

export const STANDARD_UNITS: UnitOption[] = [
  // Volume
  { value: "cum", label: "cum (Cubic Meter - m³)", category: "Volume" },
  { value: "ltr", label: "ltr (Liter)", category: "Volume" },
  { value: "cft", label: "cft (Cubic Feet)", category: "Volume" },
  { value: "KL", label: "KL (Kiloliter)", category: "Volume" },
  
  // Area
  { value: "sqm", label: "sqm (Square Meter - m²)", category: "Area" },
  { value: "sqft", label: "sqft (Square Feet)", category: "Area" },
  { value: "ha", label: "ha (Hectare)", category: "Area" },

  // Length
  { value: "rmt", label: "rmt (Running Meter - m)", category: "Length" },
  { value: "km", label: "km (Kilometer)", category: "Length" },
  { value: "ft", label: "ft (Feet)", category: "Length" },

  // Weight
  { value: "kg", label: "kg (Kilogram)", category: "Weight" },
  { value: "MT", label: "MT (Metric Ton / Tonne)", category: "Weight" },
  { value: "quintal", label: "quintal (100 kg)", category: "Weight" },

  // Count & Packaging
  { value: "nos", label: "nos (Numbers / Pieces)", category: "Count & Packaging" },
  { value: "bag", label: "bag (50kg Bag)", category: "Count & Packaging" },
  { value: "set", label: "set (Set)", category: "Count & Packaging" },
  { value: "trip", label: "trip (Truck / Tipper Load)", category: "Count & Packaging" },
  { value: "roll", label: "roll (Roll)", category: "Count & Packaging" },
  { value: "drum", label: "drum (Drum / Barrel)", category: "Count & Packaging" },
  { value: "bundle", label: "bundle (Bundle)", category: "Count & Packaging" },
  { value: "cylinder", label: "cylinder (Gas Cylinder)", category: "Count & Packaging" },
  { value: "pair", label: "pair (Pair)", category: "Count & Packaging" },
  { value: "pack", label: "pack (Packet / Box)", category: "Count & Packaging" },
  { value: "lot", label: "lot (Lot)", category: "Count & Packaging" },
  { value: "job", label: "job / LS (Lump Sum)", category: "Time & Other" },
  { value: "hr", label: "hr (Hour)", category: "Time & Other" },
  { value: "day", label: "day (Day / Shift)", category: "Time & Other" },
];

export const UNIT_CATEGORIES = [
  "Volume",
  "Area",
  "Length",
  "Weight",
  "Count & Packaging",
  "Time & Other",
] as const;
