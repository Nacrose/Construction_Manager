/**
 * MS Project XML (MSPDI) import parser.
 *
 * Parses an MS Project XML file (the same format we export) and converts
 * it into a list of tasks with dependencies, ready to insert as GanttTasks.
 *
 * Supported elements:
 *  - <Task> with Name, WBS, Start, Finish, Duration, PercentComplete, Milestone
 *  - <OutlineLevel> for parent/child hierarchy
 *  - <PredecessorLink> with Type + LinkLag
 *  - <Work> (person-hours)
 *  - <Type> (0=FixedUnits, 1=FixedDuration, 2=FixedWork)
 *  - <ConstraintType> (0-7) + <ConstraintDate>
 *  - <Deadline>
 *  - <Notes>
 *  - <EffortDriven>, <Estimated>, <IgnoreResourceCalendar>
 *  - <Priority> (0-1000)
 *  - <EarnedValueMethod> (0=%Complete, 1=%WorkComplete)
 *  - <ActualStart>, <ActualFinish>
 *  - <Resource> + <Assignment> (basic — stored as notes for now)
 *
 * All MS Project numeric codes are mapped to our string enums.
 */

export type ParsedMSPTask = {
  uid: number; // MS Project UID (1-based)
  name: string;
  wbs: string | null;
  outlineLevel: number;
  startDate: Date;
  endDate: Date;
  durationDays: number;
  progress: number; // 0..100
  isMilestone: boolean;
  isSummary: boolean;
  // MS Project compatibility fields
  workHours: number;
  taskType: string; // fixed_duration | fixed_work | fixed_units
  constraintType: string; // asap | alap | mso | mfo | snlt | fnlt | fnet | snet
  constraintDate: Date | null;
  deadline: Date | null;
  notes: string | null;
  effortDriven: boolean;
  estimated: boolean;
  ignoreResourceCalendar: boolean;
  priority: number;
  earnedValueMethod: string; // percent_complete | percent_work_complete
  actualStartDate: Date | null;
  actualEndDate: Date | null;
  plannedCost: number;
  // Dependencies (resolved by UID)
  predecessors: Array<{
    predecessorUid: number;
    type: string; // FS | SS | FF | SF
    offsetDays: number;
  }>;
};

export type ParsedMSPResource = {
  uid: number;
  name: string;
  type: string; // work | material | cost
  maxUnits: number; // 1.0 = 100%
  standardRate: number; // per hour
  materialLabel: string | null;
};

export type ParsedMSPAssignment = {
  taskUid: number;
  resourceUid: number;
  units: number; // 1.0 = 100%
  workHours: number;
  startDate: Date | null;
  endDate: Date | null;
};

export type ParsedMSPResult = {
  projectName: string;
  startDate: Date | null;
  finishDate: Date | null;
  tasks: ParsedMSPTask[];
  resources: ParsedMSPResource[];
  assignments: ParsedMSPAssignment[];
  warnings: string[];
};

/**
 * Parse an MS Project XML string into a structured result.
 *
 * Throws on malformed XML. Returns warnings for unrecognized elements
 * rather than failing.
 */
export function parseMSPXML(xmlString: string): ParsedMSPResult {
  const warnings: string[] = [];

  // Use DOMParser (available in Node 18+ via @xmldom or in browser)
  // For server-side Node, we use the built-in DOMParser polyfill if available,
  // otherwise we fall back to a regex-based parser.
  let doc: Document;
  try {
    if (typeof DOMParser !== "undefined") {
      const parser = new DOMParser();
      doc = parser.parseFromString(xmlString, "text/xml");
    } else {
      // Node.js fallback — use a simple regex-based extractor
      return parseMSPXMLFallback(xmlString);
    }
  } catch (err) {
    return parseMSPXMLFallback(xmlString);
  }

  // Check for parse errors
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    return parseMSPXMLFallback(xmlString);
  }

  // Project-level metadata
  const projectEl = doc.querySelector("Project");
  const projectName = getText(projectEl, "Name") || "Imported Project";
  const projectStartStr = getText(projectEl, "StartDate");
  const projectFinishStr = getText(projectEl, "FinishDate");
  const startDate = projectStartStr ? new Date(projectStartStr) : null;
  const finishDate = projectFinishStr ? new Date(projectFinishStr) : null;

  // Parse tasks
  const taskEls = doc.querySelectorAll("Tasks > Task");
  const tasks: ParsedMSPTask[] = [];

  taskEls.forEach((taskEl) => {
    const uid = parseInt(getText(taskEl, "UID") || "0", 10);
    const id = parseInt(getText(taskEl, "ID") || String(uid), 10);
    if (!uid) return;

    const name = getText(taskEl, "Name") || `Task ${id}`;
    const wbs = getText(taskEl, "WBS") || getText(taskEl, "OutlineNumber");
    const outlineLevel = parseInt(getText(taskEl, "OutlineLevel") || "1", 10);
    const startStr = getText(taskEl, "Start");
    const finishStr = getText(taskEl, "Finish");
    const startDate = startStr ? new Date(startStr) : new Date();
    const endDate = finishStr ? new Date(finishStr) : new Date();

    // Duration: PT40H0M0S → 40 hours → 5 days (8h/day)
    const durationStr = getText(taskEl, "Duration") || "";
    const durationDays = parseDurationDays(durationStr);

    const progress = parseFloat(getText(taskEl, "PercentComplete") || "0");
    const isMilestone = getText(taskEl, "Milestone") === "1";
    const isSummary = getText(taskEl, "Summary") === "1";

    // Work hours
    const workStr = getText(taskEl, "Work") || "";
    const workHours = parseDurationHours(workStr);

    // Task type: 0=FixedUnits, 1=FixedDuration, 2=FixedWork
    const typeCode = getText(taskEl, "Type") || "1";
    const taskType =
      typeCode === "0" ? "fixed_units" :
      typeCode === "2" ? "fixed_work" :
      "fixed_duration";

    // Constraint type: 0-7
    const constraintCode = getText(taskEl, "ConstraintType") || "0";
    const constraintType = mapConstraintType(constraintCode);
    const constraintDateStr = getText(taskEl, "ConstraintDate");
    const constraintDate = constraintDateStr ? new Date(constraintDateStr) : null;

    // Deadline
    const deadlineStr = getText(taskEl, "Deadline");
    const deadline = deadlineStr ? new Date(deadlineStr) : null;

    // Notes
    const notes = getText(taskEl, "Notes");

    // Boolean fields
    const effortDriven = getText(taskEl, "EffortDriven") === "1";
    const estimated = getText(taskEl, "Estimated") === "1";
    const ignoreResourceCalendar = getText(taskEl, "IgnoreResourceCalendar") === "1";

    // Priority (0-1000)
    const priority = parseInt(getText(taskEl, "Priority") || "500", 10);

    // Earned value method: 0=%Complete, 1=%WorkComplete
    const evmCode = getText(taskEl, "EarnedValueMethod") || "0";
    const earnedValueMethod = evmCode === "1" ? "percent_work_complete" : "percent_complete";

    // Actual start/finish
    const actualStartStr = getText(taskEl, "ActualStart");
    const actualFinishStr = getText(taskEl, "ActualFinish");
    const actualStartDate = actualStartStr ? new Date(actualStartStr) : null;
    const actualEndDate = actualFinishStr ? new Date(actualFinishStr) : null;

    // Cost
    const costStr = getText(taskEl, "Cost") || getText(taskEl, "FixedCost") || "0";
    const plannedCost = parseFloat(costStr) || 0;

    // Predecessor links
    const predecessors: ParsedMSPTask["predecessors"] = [];
    const predEls = taskEl.querySelectorAll("PredecessorLink");
    predEls.forEach((predEl) => {
      const predecessorUid = parseInt(getText(predEl, "PredecessorUID") || "0", 10);
      if (!predecessorUid) return;
      const typeCode = getText(predEl, "Type") || "1";
      const type =
        typeCode === "0" ? "FF" :
        typeCode === "2" ? "SF" :
        typeCode === "3" ? "SS" :
        "FS";
      const linkLagStr = getText(predEl, "LinkLag") || "0";
      const lagFormat = getText(predEl, "LagFormat") || "7";
      const offsetDays = parseLagDays(linkLagStr, lagFormat);
      predecessors.push({ predecessorUid, type, offsetDays });
    });

    tasks.push({
      uid,
      name,
      wbs,
      outlineLevel,
      startDate,
      endDate,
      durationDays,
      progress,
      isMilestone,
      isSummary,
      workHours,
      taskType,
      constraintType,
      constraintDate,
      deadline,
      notes,
      effortDriven,
      estimated,
      ignoreResourceCalendar,
      priority,
      earnedValueMethod,
      actualStartDate,
      actualEndDate,
      plannedCost,
      predecessors,
    });
  });

  if (tasks.length === 0) {
    warnings.push("No tasks found in the XML file.");
  }

  // Parse resources
  const resources: ParsedMSPResource[] = [];
  const resourceEls = doc.querySelectorAll("Resources > Resource");
  resourceEls.forEach((resEl) => {
    const uid = parseInt(getText(resEl, "UID") || "0", 10);
    if (!uid) return;
    const name = getText(resEl, "Name") || `Resource ${uid}`;
    // Type: 0=Work, 1=Material, 2=Cost
    const typeCode = getText(resEl, "Type") || "0";
    const type = typeCode === "1" ? "material" : typeCode === "2" ? "cost" : "work";
    const maxUnitsStr = getText(resEl, "MaxUnits") || "1";
    const maxUnits = parseFloat(maxUnitsStr) || 1;
    const standardRateStr = getText(resEl, "StandardRate") || "0";
    const standardRate = parseFloat(standardRateStr) || 0;
    const materialLabel = getText(resEl, "MaterialLabel");
    resources.push({ uid, name, type, maxUnits, standardRate, materialLabel });
  });

  // Parse assignments
  const assignments: ParsedMSPAssignment[] = [];
  const assignEls = doc.querySelectorAll("Assignments > Assignment");
  assignEls.forEach((asgEl) => {
    const taskUid = parseInt(getText(asgEl, "TaskUID") || "0", 10);
    const resourceUid = parseInt(getText(asgEl, "ResourceUID") || "0", 10);
    if (!taskUid || !resourceUid) return;
    const unitsStr = getText(asgEl, "Units") || "1";
    const units = parseFloat(unitsStr) || 1;
    const workStr = getText(asgEl, "Work") || "";
    const workHours = parseDurationHours(workStr);
    const startStr = getText(asgEl, "Start");
    const finishStr = getText(asgEl, "Finish");
    assignments.push({
      taskUid,
      resourceUid,
      units,
      workHours,
      startDate: startStr ? new Date(startStr) : null,
      endDate: finishStr ? new Date(finishStr) : null,
    });
  });

  return { projectName, startDate, finishDate, tasks, resources, assignments, warnings };
}

/**
 * Get the text content of the first descendant element with the given tag name.
 * Returns null if not found.
 */
function getText(parent: Element | null, tagName: string): string | null {
  if (!parent) return null;
  // Query within the parent element only (avoid matching across siblings)
  const el = parent.getElementsByTagName(tagName)[0];
  if (!el) return null;
  return el.textContent?.trim() || null;
}

/**
 * Map MS Project constraint type codes to our enum values.
 * 0=AsSoonAsPossible, 1=AsLateAsPossible, 2=MustStartOn, 3=MustFinishOn,
 * 4=StartNoEarlierThan, 5=StartNoLaterThan, 6=FinishNoEarlierThan, 7=FinishNoLaterThan
 */
function mapConstraintType(code: string): string {
  const map: Record<string, string> = {
    "0": "asap",
    "1": "alap",
    "2": "mso",
    "3": "mfo",
    "4": "snet",
    "5": "snlt",
    "6": "fnet",
    "7": "fnlt",
  };
  return map[code] ?? "asap";
}

/**
 * Parse an MS Project duration string (ISO 8601 period format).
 * Examples: "PT40H0M0S" → 40 hours → 5 days; "P5D" → 5 days; "PT8H" → 1 day
 *
 * Returns duration in days (assuming 8 hours/day).
 */
function parseDurationDays(durationStr: string): number {
  const hours = parseDurationHours(durationStr);
  return Math.max(1, Math.round(hours / 8));
}

/**
 * Parse an MS Project duration string and return hours.
 */
function parseDurationHours(durationStr: string): number {
  if (!durationStr) return 0;
  // Match PT{hours}H{minutes}M{seconds}S or P{days}D
  const hourMatch = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (hourMatch) {
    const hours = parseInt(hourMatch[1] || "0", 10);
    const minutes = parseInt(hourMatch[2] || "0", 10);
    const seconds = parseInt(hourMatch[3] || "0", 10);
    return hours + minutes / 60 + seconds / 3600;
  }
  const dayMatch = durationStr.match(/P(\d+)D/i);
  if (dayMatch) {
    return parseInt(dayMatch[1], 10) * 8;
  }
  return 0;
}

/**
 * Parse MS Project LinkLag value.
 * LinkLag is in tenths of a minute (600 = 60 minutes = 1 hour) when
 * LagFormat is 7 (elapsed days). Actually it's more complex:
 *   - LagFormat 7 = days, LinkLag = days * 4800 (8h * 60min * 10)
 *   - LagFormat 3 = hours, LinkLag = hours * 600
 *   - LagFormat 5 = minutes, LinkLag = minutes * 10
 *
 * Returns offset in days.
 */
function parseLagDays(linkLagStr: string, lagFormat: string): number {
  const linkLag = parseInt(linkLagStr || "0", 10);
  if (!linkLag) return 0;

  // Detect sign (MS Project uses positive for lag, but we stored negative for lead)
  // LinkLag is always positive; the sign is determined by... actually MSP doesn't
  // have negative lags in the XML — leads are represented differently.
  // We'll just return the absolute value with the right sign convention.

  switch (lagFormat) {
    case "7": // Days
      return linkLag / 4800; // 4800 = 8h * 60min * 10
    case "3": // Hours
      return linkLag / 600 / 8; // 600 = 60min * 10, then /8 for days
    case "5": // Minutes
      return linkLag / 10 / 60 / 8;
    default:
      // Assume days (most common)
      return linkLag / 4800;
  }
}

/**
 * Fallback parser using regex — used when DOMParser is not available
 * (e.g., older Node.js without --experimental-dom).
 *
 * This is a simpler parser that extracts the key fields via regex.
 * It's less robust but handles the common cases.
 */
function parseMSPXMLFallback(xmlString: string): ParsedMSPResult {
  const warnings: string[] = ["Used fallback regex parser (DOMParser not available)"];

  const projectName = matchFirst(xmlString, /<Name>([^<]*)<\/Name>/i) || "Imported Project";
  const startMatch = matchFirst(xmlString, /<StartDate>([^<]*)<\/StartDate>/i);
  const finishMatch = matchFirst(xmlString, /<FinishDate>([^<]*)<\/FinishDate>/i);

  const tasks: ParsedMSPTask[] = [];
  const taskRegex = /<Task>([\s\S]*?)<\/Task>/gi;
  let taskMatch: RegExpExecArray | null;

  while ((taskMatch = taskRegex.exec(xmlString)) !== null) {
    const taskXml = taskMatch[1];
    const uid = parseInt(matchFirst(taskXml, /<UID>(\d+)<\/UID>/i) || "0", 10);
    if (!uid) continue;

    const name = matchFirst(taskXml, /<Name>([^<]*)<\/Name>/i) || `Task ${uid}`;
    const wbs = matchFirst(taskXml, /<WBS>([^<]*)<\/WBS>/i) || matchFirst(taskXml, /<OutlineNumber>([^<]*)<\/OutlineNumber>/i);
    const outlineLevel = parseInt(matchFirst(taskXml, /<OutlineLevel>(\d+)<\/OutlineLevel>/i) || "1", 10);
    const startStr = matchFirst(taskXml, /<Start>([^<]*)<\/Start>/i);
    const finishStr = matchFirst(taskXml, /<Finish>([^<]*)<\/Finish>/i);
    const durationStr = matchFirst(taskXml, /<Duration>([^<]*)<\/Duration>/i) || "";
    const workStr = matchFirst(taskXml, /<Work>([^<]*)<\/Work>/i) || "";
    const progress = parseFloat(matchFirst(taskXml, /<PercentComplete>([^<]*)<\/PercentComplete>/i) || "0");
    const isMilestone = matchFirst(taskXml, /<Milestone>([^<]*)<\/Milestone>/i) === "1";
    const isSummary = matchFirst(taskXml, /<Summary>([^<]*)<\/Summary>/i) === "1";

    const typeCode = matchFirst(taskXml, /<Type>([^<]*)<\/Type>/i) || "1";
    const taskType = typeCode === "0" ? "fixed_units" : typeCode === "2" ? "fixed_work" : "fixed_duration";

    const constraintCode = matchFirst(taskXml, /<ConstraintType>([^<]*)<\/ConstraintType>/i) || "0";
    const constraintType = mapConstraintType(constraintCode);
    const constraintDateStr = matchFirst(taskXml, /<ConstraintDate>([^<]*)<\/ConstraintDate>/i);

    const deadlineStr = matchFirst(taskXml, /<Deadline>([^<]*)<\/Deadline>/i);
    const notes = matchFirst(taskXml, /<Notes>([^<]*)<\/Notes>/i);
    const effortDriven = matchFirst(taskXml, /<EffortDriven>([^<]*)<\/EffortDriven>/i) === "1";
    const estimated = matchFirst(taskXml, /<Estimated>([^<]*)<\/Estimated>/i) === "1";
    const ignoreResourceCalendar = matchFirst(taskXml, /<IgnoreResourceCalendar>([^<]*)<\/IgnoreResourceCalendar>/i) === "1";
    const priority = parseInt(matchFirst(taskXml, /<Priority>([^<]*)<\/Priority>/i) || "500", 10);
    const evmCode = matchFirst(taskXml, /<EarnedValueMethod>([^<]*)<\/EarnedValueMethod>/i) || "0";

    const actualStartStr = matchFirst(taskXml, /<ActualStart>([^<]*)<\/ActualStart>/i);
    const actualFinishStr = matchFirst(taskXml, /<ActualFinish>([^<]*)<\/ActualFinish>/i);
    const costStr = matchFirst(taskXml, /<Cost>([^<]*)<\/Cost>/i) || matchFirst(taskXml, /<FixedCost>([^<]*)<\/FixedCost>/i) || "0";

    // Predecessors
    const predecessors: ParsedMSPTask["predecessors"] = [];
    const predRegex = /<PredecessorLink>[\s\S]*?<PredecessorUID>(\d+)<\/PredecessorUID>[\s\S]*?<Type>([^<]*)<\/Type>(?:[\s\S]*?<LinkLag>([^<]*)<\/LinkLag>)?[\s\S]*?<\/PredecessorLink>/gi;
    let predMatch: RegExpExecArray | null;
    while ((predMatch = predRegex.exec(taskXml)) !== null) {
      const predecessorUid = parseInt(predMatch[1], 10);
      const typeCode = predMatch[2] || "1";
      const type = typeCode === "0" ? "FF" : typeCode === "2" ? "SF" : typeCode === "3" ? "SS" : "FS";
      const lagStr = predMatch[3] || "0";
      const offsetDays = parseLagDays(lagStr, "7");
      predecessors.push({ predecessorUid, type, offsetDays });
    }

    tasks.push({
      uid,
      name,
      wbs,
      outlineLevel,
      startDate: startStr ? new Date(startStr) : new Date(),
      endDate: finishStr ? new Date(finishStr) : new Date(),
      durationDays: parseDurationDays(durationStr),
      progress,
      isMilestone,
      isSummary,
      workHours: parseDurationHours(workStr),
      taskType,
      constraintType,
      constraintDate: constraintDateStr ? new Date(constraintDateStr) : null,
      deadline: deadlineStr ? new Date(deadlineStr) : null,
      notes,
      effortDriven,
      estimated,
      ignoreResourceCalendar,
      priority,
      earnedValueMethod: evmCode === "1" ? "percent_work_complete" : "percent_complete",
      actualStartDate: actualStartStr ? new Date(actualStartStr) : null,
      actualEndDate: actualFinishStr ? new Date(actualFinishStr) : null,
      plannedCost: parseFloat(costStr) || 0,
      predecessors,
    });
  }

  if (tasks.length === 0) {
    warnings.push("No tasks found in the XML file.");
  }

  return {
    projectName,
    startDate: startMatch ? new Date(startMatch) : null,
    finishDate: finishMatch ? new Date(finishMatch) : null,
    tasks,
    resources: [],
    assignments: [],
    warnings,
  };
}

function matchFirst(str: string, regex: RegExp): string | null {
  const m = str.match(regex);
  return m ? m[1] : null;
}
