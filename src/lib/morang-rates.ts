/**
 * Morang District Rate Profile — 2082/83 (2075 BS)
 * 
 * Standard Nepal construction materials, labor, and equipment organized by
 * Trade/Discipline Tag (category), Canonical Material Name (name), and Size/Spec Rating (subCategory).
 * 
 * Rates are in NPR (Nepalese Rupees).
 */

export interface MorangRateItem {
  category: string;
  name: string;
  subCategory?: string;
  unit: string;
  rate: number;
}

export const MORANG_RATES = {
  profileName: "Morang District Rate 2082/83",
  district: "Morang",
  fiscalYear: "2082/83 BS",
  source: "Morang District Rate Committee",
  rates: [
    // ─── Civil & Concrete (Cement) ───
    { category: "Civil & Concrete", name: "Cement", subCategory: "OPC 43 Grade", unit: "bag", rate: 0 },
    { category: "Civil & Concrete", name: "Cement", subCategory: "OPC 53 Grade", unit: "bag", rate: 0 },
    { category: "Civil & Concrete", name: "Cement", subCategory: "PPC", unit: "bag", rate: 0 },
    { category: "Civil & Concrete", name: "Cement", subCategory: "White", unit: "bag", rate: 0 },

    // ─── Civil & Concrete (Aggregates & Sand) ───
    { category: "Civil & Concrete", name: "Sand", subCategory: "River", unit: "cum", rate: 0 },
    { category: "Civil & Concrete", name: "Sand", subCategory: "Crusher", unit: "cum", rate: 0 },
    { category: "Civil & Concrete", name: "Aggregate", subCategory: "20mm", unit: "cum", rate: 0 },
    { category: "Civil & Concrete", name: "Aggregate", subCategory: "10mm", unit: "cum", rate: 0 },
    { category: "Civil & Concrete", name: "Aggregate", subCategory: "Crusher Dust", unit: "cum", rate: 0 },
    { category: "Civil & Concrete", name: "Aggregate", subCategory: "Boulders", unit: "cum", rate: 0 },
    { category: "Civil & Concrete", name: "Aggregate", subCategory: "Gravel", unit: "cum", rate: 0 },

    // ─── Steel & Rebar ───
    { category: "Steel & Rebar", name: "Rebar", subCategory: "Fe500 TMT", unit: "kg", rate: 0 },
    { category: "Steel & Rebar", name: "Rebar", subCategory: "Fe500D TMT", unit: "kg", rate: 0 },
    { category: "Steel & Rebar", name: "Mild Steel Round Bar", subCategory: "Standard", unit: "kg", rate: 0 },
    { category: "Steel & Rebar", name: "Binding Wire", subCategory: "20 SWG", unit: "kg", rate: 0 },

    // ─── Bricks & Masonry ───
    { category: "Civil & Concrete", name: "Bricks", subCategory: "1st Class", unit: "nos", rate: 0 },
    { category: "Civil & Concrete", name: "Bricks", subCategory: "2nd Class", unit: "nos", rate: 0 },
    { category: "Civil & Concrete", name: "AAC Block", subCategory: "Standard", unit: "nos", rate: 0 },
    { category: "Civil & Concrete", name: "Concrete Block", subCategory: "Hollow", unit: "nos", rate: 0 },

    // ─── Bituminous Materials ───
    { category: "Civil & Concrete", name: "Bitumen", subCategory: "VG-30", unit: "kg", rate: 0 },
    { category: "Civil & Concrete", name: "Bitumen", subCategory: "VG-40", unit: "kg", rate: 0 },
    { category: "Civil & Concrete", name: "Bitumen Emulsion", subCategory: "Rapid Setting", unit: "ltr", rate: 0 },
    { category: "Civil & Concrete", name: "Macadam Aggregate", subCategory: "Crusher Run", unit: "cum", rate: 0 },

    // ─── Timber & Wood ───
    { category: "Finishes & Carpentry", name: "Timber", subCategory: "Sal Wood", unit: "cum", rate: 0 },
    { category: "Finishes & Carpentry", name: "Plywood", subCategory: "18mm", unit: "sqm", rate: 0 },
    { category: "Finishes & Carpentry", name: "Timber Battens", subCategory: "50x75mm", unit: "rmt", rate: 0 },

    // ─── Paint & Finishes ───
    { category: "Finishes & Carpentry", name: "Acrylic Emulsion Paint", subCategory: "Exterior", unit: "ltr", rate: 0 },
    { category: "Finishes & Carpentry", name: "Primer", subCategory: "Wall Primer", unit: "ltr", rate: 0 },
    { category: "Finishes & Carpentry", name: "Enamel Paint", subCategory: "Gloss", unit: "ltr", rate: 0 },
    { category: "Finishes & Carpentry", name: "Wall Putty", subCategory: "Cement Based", unit: "kg", rate: 0 },

    // ─── Plumbing & Sanitary ───
    { category: "Plumbing & Sanitary", name: "RCC NP3 Pipe", subCategory: "300mm dia", unit: "rmt", rate: 0 },
    { category: "Plumbing & Sanitary", name: "RCC NP3 Pipe", subCategory: "450mm dia", unit: "rmt", rate: 0 },
    { category: "Plumbing & Sanitary", name: "RCC NP3 Pipe", subCategory: "600mm dia", unit: "rmt", rate: 0 },
    { category: "Plumbing & Sanitary", name: "RCC NP3 Pipe", subCategory: "1000mm dia", unit: "rmt", rate: 0 },
    { category: "Plumbing & Sanitary", name: "HDPE Pipe", subCategory: "110mm dia", unit: "rmt", rate: 0 },
    { category: "Plumbing & Sanitary", name: "PVC Pipe", subCategory: "50mm dia", unit: "rmt", rate: 0 },

    // ─── Labor (Daily Wages) ───
    { category: "Labor", name: "Mason", subCategory: "Skilled", unit: "day", rate: 0 },
    { category: "Labor", name: "Carpenter", subCategory: "Skilled", unit: "day", rate: 0 },
    { category: "Labor", name: "Bar Bender", subCategory: "Skilled", unit: "day", rate: 0 },
    { category: "Labor", name: "Painter", subCategory: "Skilled", unit: "day", rate: 0 },
    { category: "Labor", name: "Technician", subCategory: "Skilled", unit: "day", rate: 0 },
    { category: "Labor", name: "Labourer", subCategory: "Unskilled", unit: "day", rate: 0 },
    { category: "Labor", name: "Welder", subCategory: "Skilled", unit: "day", rate: 0 },
    { category: "Labor", name: "Plumber", subCategory: "Skilled", unit: "day", rate: 0 },
    { category: "Labor", name: "Electrician", subCategory: "Skilled", unit: "day", rate: 0 },

    // ─── Equipment (Hourly Rates) ───
    { category: "Equipment & Machinery", name: "Excavator", subCategory: "0.9 cum", unit: "hour", rate: 0 },
    { category: "Equipment & Machinery", name: "Excavator", subCategory: "1.2 cum", unit: "hour", rate: 0 },
    { category: "Equipment & Machinery", name: "Dozer", subCategory: "Bulldozer", unit: "hour", rate: 0 },
    { category: "Equipment & Machinery", name: "Roller", subCategory: "8-10 Ton", unit: "hour", rate: 0 },
    { category: "Equipment & Machinery", name: "Grader", subCategory: "Motor Grader", unit: "hour", rate: 0 },
    { category: "Equipment & Machinery", name: "Paver Finisher", subCategory: "Asphalt Paver", unit: "hour", rate: 0 },
    { category: "Equipment & Machinery", name: "Hot Mix Plant", subCategory: "60-90 TPH", unit: "hour", rate: 0 },
    { category: "Equipment & Machinery", name: "Concrete Mixer", subCategory: "Standard", unit: "hour", rate: 0 },
    { category: "Equipment & Machinery", name: "Concrete Pump", subCategory: "Boom Pump", unit: "hour", rate: 0 },
    { category: "Equipment & Machinery", name: "Tractor-Trolley", subCategory: "Standard", unit: "hour", rate: 0 },
    { category: "Equipment & Machinery", name: "Tipper Truck", subCategory: "10 Ton", unit: "hour", rate: 0 },
    { category: "Equipment & Machinery", name: "Air Compressor", subCategory: "Pneumatic", unit: "hour", rate: 0 },
    { category: "Equipment & Machinery", name: "Drilling Machine", subCategory: "Rock Drill", unit: "hour", rate: 0 },
    { category: "Equipment & Machinery", name: "Crane", subCategory: "15 Ton", unit: "hour", rate: 0 },

    // ─── Water & Fuel ───
    { category: "Fuel & Lubricants", name: "Water", subCategory: "Construction Grade", unit: "ltr", rate: 0 },
    { category: "Fuel & Lubricants", name: "Diesel", subCategory: "Auto Diesel", unit: "ltr", rate: 0 },
    { category: "Fuel & Lubricants", name: "Petrol", subCategory: "Motor Spirit", unit: "ltr", rate: 0 },
    { category: "Electrical & Power", name: "Electricity", subCategory: "Commercial Tariff", unit: "kWh", rate: 0 },

    // ─── General Hardware & Props ───
    { category: "General Hardware", name: "Nails & Accessories", subCategory: "Assorted", unit: "kg", rate: 0 },
    { category: "General Hardware", name: "Shuttering Oil", subCategory: "Form Release Agent", unit: "ltr", rate: 0 },
    { category: "General Hardware", name: "Props", subCategory: "Steel Adjustable", unit: "nos", rate: 0 },
    { category: "General Hardware", name: "MS Sheet", subCategory: "14 Gauge", unit: "kg", rate: 0 },
    { category: "General Hardware", name: "MS Pipe", subCategory: "40mm dia", unit: "rmt", rate: 0 },
    { category: "General Hardware", name: "Clamps", subCategory: "Scaffolding", unit: "nos", rate: 0 },
  ],
};
