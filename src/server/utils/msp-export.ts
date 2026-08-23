/**
 * MS Project XML (MSPDI) export utility.
 *
 * Generates an XML file in Microsoft Project Data Interchange format
 * that can be imported by MS Project, Primavera P6, and other
 * scheduling tools.
 *
 * Format: MS Project XML 2010+ (xmlns: http://schemas.microsoft.com/project)
 *
 * Supports:
 * - Task hierarchy (parent/child via outline level)
 * - Task names, codes, durations, start/end dates
 * - Dependencies (FS, SS, FF, SF with lag)
 * - Progress (percent complete)
 * - Milestones
 * - BOQ-linked planned costs (as task cost)
 */

import { format } from "date-fns";

export type MSPTask = {
  id: string;
  name: string;
  code: string | null;
  startDate: Date;
  endDate: Date;
  actualStartDate?: Date | null;
  actualEndDate?: Date | null;
  duration: number; // days
  progress: number; // 0..100
  parentId: string | null;
  isMilestone: boolean;
  sortOrder: number;
  plannedCost: number;
  // MS Project compatibility (all optional — export includes them only when set)
  workHours?: number; // person-hours
  taskType?: string; // fixed_duration | fixed_work | fixed_units
  constraintType?: string; // asap | alap | mso | mfo | snlt | fnlt | fnet | snet
  constraintDate?: Date | null;
  deadline?: Date | null;
  notes?: string | null;
  effortDriven?: boolean;
  estimated?: boolean;
  ignoreResourceCalendar?: boolean;
  priority?: number; // 0-1000
  earnedValueMethod?: string; // percent_complete | percent_work_complete
  dependencies: Array<{
    predecessorId?: string | null;
    predecessorCode?: string | null;
    type: string; // FS, SS, FF, SF
    offset: number; // days (positive = lag, negative = lead)
  }>;
};

/**
 * Generate MS Project XML from tasks.
 * Returns the XML string.
 */
export function generateMSPXML(tasks: MSPTask[], projectName: string): string {
  // Sort by sortOrder
  const sorted = [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);

  // Build outline levels based on parent hierarchy
  const outlineMap = new Map<string, number>();
  function getOutlineLevel(task: MSPTask): number {
    if (outlineMap.has(task.id)) return outlineMap.get(task.id)!;
    if (!task.parentId) {
      outlineMap.set(task.id, 1);
      return 1;
    }
    const parent = sorted.find((t) => t.id === task.parentId);
    if (!parent) {
      outlineMap.set(task.id, 1);
      return 1;
    }
    const level = getOutlineLevel(parent) + 1;
    outlineMap.set(task.id, level);
    return level;
  }

  // Build a code → task UID mapping and id → task UID mapping for dependency resolution
  const codeToId = new Map<string, number>();
  const idToUid = new Map<string, number>();
  sorted.forEach((t, i) => {
    const uid = i + 1;
    idToUid.set(t.id, uid);
    if (t.code) codeToId.set(t.code, uid);
  });

  // Calculate project dates
  const allStarts = sorted.map((t) => t.startDate.getTime()).filter(Boolean);
  const allEnds = sorted.map((t) => t.endDate.getTime()).filter(Boolean);
  const projectStart = allStarts.length ? new Date(Math.min(...allStarts)) : new Date();

  // Format date for MSP (YYYY-MM-DDTHH:mm:ss)
  const fmtMSPDate = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm:ss");
  // Format duration (PT{days}D for days, or PT{hours}H for hours)
  const fmtDuration = (days: number) => `PT${Math.max(days, 1) * 8}H0M0S`;
  // Format work hours (PT{hours}H0M0S)
  const fmtWork = (hours: number) => `PT${Math.round(hours)}H0M0S`;

  // Map our constraint types to MS Project numeric codes
  // 0=AsSoonAsPossible, 1=AsLateAsPossible, 2=MustStartOn, 3=MustFinishOn,
  // 4=StartNoEarlierThan, 5=StartNoLaterThan, 6=FinishNoEarlierThan, 7=FinishNoLaterThan
  const constraintTypeMap: Record<string, string> = {
    asap: "0", alap: "1", mso: "2", mfo: "3",
    snet: "4", snlt: "5", fnet: "6", fnlt: "7",
  };

  // Map our task types to MS Project: 0=FixedUnits, 1=FixedDuration, 2=FixedWork
  const taskTypeMap: Record<string, string> = {
    fixed_units: "0", fixed_duration: "1", fixed_work: "2",
  };

  // Build task XML
  const taskXML = sorted.map((task, i) => {
    const uid = i + 1;
    const outlineLevel = getOutlineLevel(task);
    const deps = task.dependencies.filter((d) =>
      (d.predecessorId && idToUid.has(d.predecessorId)) ||
      (d.predecessorCode && codeToId.has(d.predecessorCode))
    );

    const depXML = deps.map((dep) => {
      const predUid =
        (dep.predecessorId ? idToUid.get(dep.predecessorId) : null) ??
        (dep.predecessorCode ? codeToId.get(dep.predecessorCode) : null)!;
      const depType = dep.type === "FS" ? "1" : dep.type === "SS" ? "3" : dep.type === "FF" ? "0" : "2";
      const lag = dep.offset !== 0 ? `
              <LinkLag>${dep.offset * 4800}</LinkLag>
              <LagFormat>7</LagFormat>` : "";
      return `          <PredecessorLink>
            <PredecessorUID>${predUid}</PredecessorUID>
            <Type>${depType}</Type>${lag}
          </PredecessorLink>`;
    }).join("\n");

    // Conditional fields — only emit when set, so existing exports stay compact
    const workXML = task.workHours && task.workHours > 0
      ? `<Work>${fmtWork(task.workHours)}</Work>`
      : `<Work>${fmtDuration(task.duration)}</Work>`;

    const actualStartXML = task.actualStartDate
      ? `<ActualStart>${fmtMSPDate(task.actualStartDate)}</ActualStart>`
      : "";

    const actualFinishXML = task.actualEndDate
      ? `<ActualFinish>${fmtMSPDate(task.actualEndDate)}</ActualFinish>`
      : "";

    const constraintXML = task.constraintType && task.constraintType !== "asap"
      ? `<ConstraintType>${constraintTypeMap[task.constraintType] ?? "0"}</ConstraintType>` +
        (task.constraintDate ? `<ConstraintDate>${fmtMSPDate(task.constraintDate)}</ConstraintDate>` : "")
      : `<ConstraintType>0</ConstraintType>`;

    const deadlineXML = task.deadline
      ? `<Deadline>${fmtMSPDate(task.deadline)}</Deadline>`
      : "";

    const notesXML = task.notes
      ? `<Notes>${escapeXML(task.notes)}</Notes>`
      : "";

    const priorityVal = task.priority ?? 500;
    const taskTypeVal = taskTypeMap[task.taskType ?? "fixed_duration"] ?? "1";
    const evmVal = task.earnedValueMethod === "percent_work_complete" ? "1" : "0";

    return `        <Task>
          <UID>${uid}</UID>
          <ID>${uid}</ID>
          <Name>${escapeXML(task.name)}</Name>
          <Type>${taskTypeVal}</Type>
          <CreateDate>${fmtMSPDate(new Date())}</CreateDate>
          <WBS>${escapeXML(task.code ?? String(uid))}</WBS>
          <OutlineLevel>${outlineLevel}</OutlineLevel>
          <OutlineNumber>${escapeXML(task.code ?? String(uid))}</OutlineNumber>
          <Priority>${priorityVal}</Priority>
          <Start>${fmtMSPDate(task.startDate)}</Start>
          <Finish>${fmtMSPDate(task.endDate)}</Finish>
          ${actualStartXML}
          ${actualFinishXML}
          <Duration>${fmtDuration(task.duration)}</Duration>
          <DurationFormat>7</DurationFormat>
          ${workXML}
          <ResumeValid>0</ResumeValid>
          <EffortDriven>${task.effortDriven ? "1" : "0"}</EffortDriven>
          <Recurring>0</Recurring>
          <OverAllocated>0</OverAllocated>
          <Estimated>${task.estimated ? "1" : "0"}</Estimated>
          <Milestone>${task.isMilestone ? "1" : "0"}</Milestone>
          <Summary>0</Summary>
          <Critical>0</Critical>
          <IsSubproject>0</IsSubproject>
          <IsSubprojectReadOnly>0</IsSubprojectReadOnly>
          <ExternalTask>0</ExternalTask>
          <IgnoreResourceCalendar>${task.ignoreResourceCalendar ? "1" : "0"}</IgnoreResourceCalendar>
          ${constraintXML}
          ${deadlineXML}
          <PercentComplete>${task.progress}</PercentComplete>
          <PercentWorkComplete>${task.progress}</PercentWorkComplete>
          <Cost>${task.plannedCost.toFixed(2)}</Cost>
          <FixedCost>${task.plannedCost.toFixed(2)}</FixedCost>
          <FixedCostAccrual>2</FixedCostAccrual>
          <TaskMode>0</TaskMode>
          <EarnedValueMethod>${evmVal}</EarnedValueMethod>
          ${notesXML}
${depXML || "          "}
        </Task>`;
  }).join("\n");

  // Build full XML
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <UID>1</UID>
  <Name>${escapeXML(projectName)}</Name>
  <Title>${escapeXML(projectName)}</Title>
  <ScheduleFromStart>1</ScheduleFromStart>
  <StartDate>${fmtMSPDate(projectStart)}</StartDate>
  <FinishDate>${fmtMSPDate(allEnds.length ? new Date(Math.max(...allEnds)) : projectStart)}</FinishDate>
  <FYStartDate>0101</FYStartDate>
  <CriticalSlackLimit>0</CriticalSlackLimit>
  <CurrencyDigits>2</CurrencyDigits>
  <CurrencySymbol>NPR</CurrencySymbol>
  <CurrencySymbolPosition>0</CurrencySymbolPosition>
  <DurationFormat>7</DurationFormat>
  <WorkFormat>2</WorkFormat>
  <EditableActualCosts>0</EditableActualCosts>
  <HonorConstraints>1</HonorConstraints>
  <EarnedValueMethod>0</EarnedValueMethod>
  <InsertedProjectsLikeSummary>1</InsertedProjectsLikeSummary>
  <MultipleCriticalPaths>0</MultipleCriticalPaths>
  <NewTasksEffortDriven>0</NewTasksEffortDriven>
  <NewTasksEstimated>0</NewTasksEstimated>
  <DefaultTaskType>0</DefaultTaskType>
  <DefaultFixedCostAccrual>2</DefaultFixedCostAccrual>
  <DefaultStandardRate>0</DefaultStandardRate>
  <DefaultOvertimeRate>0</DefaultOvertimeRate>
  <DefaultWorkFormat>2</DefaultWorkFormat>
  <ExtendedAttributes />
  <Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>Standard</Name>
      <IsBaseCalendar>1</IsBaseCalendar>
      <BaseCalendarUID>-1</BaseCalendarUID>
      <WeekDays>
        <WeekDay>
          <DayType>7</DayType>
          <DayWorking>0</DayWorking>
        </WeekDay>
        <WeekDay>
          <DayType>1</DayType>
          <DayWorking>1</DayWorking>
          <WorkingTimes>
            <WorkingTime>
              <FromTime>08:00:00</FromTime>
              <ToTime>12:00:00</ToTime>
            </WorkingTime>
            <WorkingTime>
              <FromTime>13:00:00</FromTime>
              <ToTime>17:00:00</ToTime>
            </WorkingTime>
          </WorkingTimes>
        </WeekDay>
        <WeekDay>
          <DayType>2</DayType>
          <DayWorking>1</DayWorking>
          <WorkingTimes>
            <WorkingTime>
              <FromTime>08:00:00</FromTime>
              <ToTime>12:00:00</ToTime>
            </WorkingTime>
            <WorkingTime>
              <FromTime>13:00:00</FromTime>
              <ToTime>17:00:00</ToTime>
            </WorkingTime>
          </WorkingTimes>
        </WeekDay>
        <WeekDay>
          <DayType>3</DayType>
          <DayWorking>1</DayWorking>
          <WorkingTimes>
            <WorkingTime>
              <FromTime>08:00:00</FromTime>
              <ToTime>12:00:00</ToTime>
            </WorkingTime>
            <WorkingTime>
              <FromTime>13:00:00</FromTime>
              <ToTime>17:00:00</ToTime>
            </WorkingTime>
          </WorkingTimes>
        </WeekDay>
        <WeekDay>
          <DayType>4</DayType>
          <DayWorking>1</DayWorking>
          <WorkingTimes>
            <WorkingTime>
              <FromTime>08:00:00</FromTime>
              <ToTime>12:00:00</ToTime>
            </WorkingTime>
            <WorkingTime>
              <FromTime>13:00:00</FromTime>
              <ToTime>17:00:00</ToTime>
            </WorkingTime>
          </WorkingTimes>
        </WeekDay>
        <WeekDay>
          <DayType>5</DayType>
          <DayWorking>1</DayWorking>
          <WorkingTimes>
            <WorkingTime>
              <FromTime>08:00:00</FromTime>
              <ToTime>12:00:00</ToTime>
            </WorkingTime>
            <WorkingTime>
              <FromTime>13:00:00</FromTime>
              <ToTime>17:00:00</ToTime>
            </WorkingTime>
          </WorkingTimes>
        </WeekDay>
        <WeekDay>
          <DayType>6</DayType>
          <DayWorking>1</DayWorking>
          <WorkingTimes>
            <WorkingTime>
              <FromTime>08:00:00</FromTime>
              <ToTime>12:00:00</ToTime>
            </WorkingTime>
            <WorkingTime>
              <FromTime>13:00:00</FromTime>
              <ToTime>17:00:00</ToTime>
            </WorkingTime>
          </WorkingTimes>
        </WeekDay>
      </WeekDays>
    </Calendar>
  </Calendars>
  <Tasks>
${taskXML}
  </Tasks>
</Project>`;
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
