"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { parseJsonArray, jsonArrayString } from "./types";

export function useDailyReportState({ id, reportId }: { id: string; reportId: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [activeSection, setActiveSection] = useState("progress");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<{ field: string; at: Date } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const { data: reportData, isLoading } = trpc.workflow.dailyReport.getReport.useQuery({ reportId });
  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });

  const report = reportData?.report;
  const myRole = projectInfo?.myRole;
  const isAdmin = myRole === "project_manager" || myRole === "coordinator";
  const isWriter = !!myRole;
  const canEdit = report?.status === "draft" && isWriter;
  const canDelete = isAdmin || (isWriter && report?.status === "draft");

  const programDateISO = useMemo(() => {
    return report?.reportDate ? new Date(report.reportDate).toISOString() : "";
  }, [report?.reportDate]);

  const { data: programResources } = trpc.workflow.dailyProgram.getProgramResources.useQuery(
    { projectId: id, programDate: programDateISO },
    { enabled: !!report?.reportDate && !!programDateISO }
  );
  const staffList = programResources?.staffList ?? [];
  const equipmentList = programResources?.equipmentList ?? [];

  const updateMutation = trpc.workflow.dailyReport.updateReport.useMutation({
    onSuccess: () => {
      utils.workflow.dailyReport.getReport.invalidate({ reportId });
      setSaving(false);
      setLastSaved({ field: activeSection, at: new Date() });
    },
    onError: (e) => {
      setSaving(false);
      toast.error(e.message);
    },
  });

  const statusMutation = trpc.workflow.dailyReport.updateReport.useMutation({
    onSuccess: (_data, vars) => {
      utils.workflow.dailyReport.getReport.invalidate({ reportId });
      utils.workflow.dailyReport.listReports.invalidate({ projectId: id });
      if (vars.status === "submitted") {
        setJustSubmitted(true);
        setShareOpen(true);
        toast.success("Report submitted successfully");
      } else {
        toast.success("Status updated");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.workflow.dailyReport.deleteReport.useMutation({
    onSuccess: () => {
      utils.workflow.dailyReport.listReports.invalidate({ projectId: id });
      toast.success("Report deleted");
      router.push(`/projects/${id}/workflow/reports`);
    },
    onError: (e) => toast.error(e.message),
  });

  const saveField = useCallback((field: string, value: any) => {
    if (!canEdit) return;
    setSaving(true);
    updateMutation.mutate({ reportId, [field]: value });
  }, [canEdit, reportId, updateMutation]);

  const [workforce, setWorkforce] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [progress, setProgress] = useState<any[]>([]);
  const [visitors, setVisitors] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [fetchingWeather, setFetchingWeather] = useState(false);
  const [weatherNonce, setWeatherNonce] = useState(0);

  const handleCopyFromPrevious = async (section: "workforce" | "equipment") => {
    if (!report) return;
    setCopying(true);
    try {
      const allReports = await utils.workflow.dailyReport.listReports.fetch({ projectId: report.projectId });
      const previous = allReports.reports
        .filter((r: any) => new Date(r.reportDate) < new Date(report.reportDate))
        .sort((a: any, b: any) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime())[0];

      if (!previous) {
        toast.info("No previous daily reports found to copy from");
        setCopying(false);
        return;
      }

      const prevDetail = await utils.workflow.dailyReport.getReport.fetch({ reportId: previous.id });
      if (!prevDetail?.report) {
        toast.error("Failed to load previous report");
        setCopying(false);
        return;
      }

      if (section === "workforce") {
        const prevWorkforce = parseJsonArray(prevDetail.report.workforce);
        if (prevWorkforce.length === 0) {
          toast.info("Previous report had no workforce entries");
        } else {
          setWorkforce(prevWorkforce);
          saveField("workforce", jsonArrayString(prevWorkforce));
          toast.success(`Copied ${prevWorkforce.length} workforce row(s) from ${previous.number}`);
        }
      } else {
        const prevEquip = parseJsonArray(prevDetail.report.equipmentUsed);
        if (prevEquip.length === 0) {
          toast.info("Previous report had no equipment entries");
        } else {
          setEquipment(prevEquip);
          saveField("equipmentUsed", jsonArrayString(prevEquip));
          toast.success(`Copied ${prevEquip.length} equipment row(s) from ${previous.number}`);
        }
      }
    } catch {
      toast.error("Failed to copy from previous report");
    } finally {
      setCopying(false);
    }
  };

  const handleSyncFromProgram = async () => {
    setSyncing(true);
    try {
      const prog = await utils.workflow.dailyProgram.getApprovedDailyProgramByDate.fetch({
        projectId: id,
        programDate: new Date(report?.reportDate ?? Date.now()).toISOString(),
      });
      if (!prog?.tasks?.length) {
        toast.info("No approved daily program found for this date. Enter progress manually.");
        setSyncing(false);
        return;
      }

      const programTasks = prog.tasks;
      const suggestions = programTasks.map((t: any) => ({
        boqCode: t.boqCode || "",
        boqDesc: t.boqDesc || t.taskName || "",
        location: t.location || "",
        plannedQty: t.plannedQty || 0,
        unit: t.unit || "",
        actualQty: t.actualQty || 0,
        batchedQty: t.batchedQty || t.actualQty || 0,
        payableQty: t.payableQty || t.actualQty || 0,
        paymentType: t.paymentType || "payable",
        executionStatus: t.executionStatus || "planned",
        ganttTaskId: t.ganttTaskId || null,
        boqItemId: t.boqItemId || null,
      }));

      const merged = [...progress];
      for (const s of suggestions) {
        const existing = progress.find((p) => p.boqCode === s.boqCode && p.boqDesc === s.boqDesc);
        if (!existing) merged.push(s);
      }
      setProgress(merged);
      saveField("workProgress", jsonArrayString(merged));
      toast.success(`Synced ${suggestions.length} tasks from Daily Program`);
    } catch {
      toast.error("Failed to sync from daily program");
    } finally {
      setSyncing(false);
    }
  };

  const handleFetchWeather = async () => {
    setFetchingWeather(true);
    try {
      const proj = projectInfo?.project as any;
      const lat = proj?.latitude ?? 27.7172;
      const lng = proj?.longitude ?? 85.3240;
      const dateStr = format(new Date(report?.reportDate ?? Date.now()), "yyyy-MM-dd");

      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,precipitation,weathercode&timezone=auto`;
      let res = await fetch(url);
      if (!res.ok) {
        const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,precipitation,weathercode&timezone=auto`;
        res = await fetch(forecastUrl);
      }

      if (!res.ok) {
        toast.error("Could not fetch weather data");
        setFetchingWeather(false);
        return;
      }

      const data = await res.json();
      const hourly = data?.hourly;
      if (!hourly?.temperature_2m?.length) {
        toast.info("No weather data available for this date");
        setFetchingWeather(false);
        return;
      }

      const temps: number[] = hourly.temperature_2m.filter((t: any) => t !== null);
      const precips: number[] = (hourly.precipitation || []).filter((p: any) => p !== null);
      const maxTemp = temps.length ? Math.round(Math.max(...temps) * 10) / 10 : null;
      const minTemp = temps.length ? Math.round(Math.min(...temps) * 10) / 10 : null;
      const totalRain = precips.length ? Math.round(precips.reduce((a, b) => a + b, 0) * 10) / 10 : null;

      const codeToCondition = (code: number | null | undefined): string => {
        if (code === null || code === undefined) return "clear";
        if (code === 0) return "clear";
        if (code <= 3) return "cloudy";
        if (code <= 48) return "fog";
        if (code <= 67) return "rain";
        if (code <= 77) return "rain";
        if (code <= 82) return "rain";
        if (code >= 95) return "storm";
        return "overcast";
      };

      const morningCode = hourly.weathercode?.[8] ?? hourly.weathercode?.[0];
      const afternoonCode = hourly.weathercode?.[14] ?? hourly.weathercode?.[6];
      const eveningCode = hourly.weathercode?.[18] ?? hourly.weathercode?.[10];

      const updates: any = {};
      if (maxTemp !== null) updates.maxTempC = maxTemp;
      if (minTemp !== null) updates.minTempC = minTemp;
      if (totalRain !== null) updates.rainfallMm = totalRain;
      updates.weatherMorning = codeToCondition(morningCode);
      updates.weatherAfternoon = codeToCondition(afternoonCode);
      updates.weatherEvening = codeToCondition(eveningCode);

      updateMutation.mutate({ reportId, ...updates });
      setWeatherNonce((n) => n + 1);
      toast.success(`Weather fetched: ${maxTemp}°C max, ${totalRain ?? 0}mm rain`);
    } catch {
      toast.error("Weather fetch failed");
    } finally {
      setFetchingWeather(false);
    }
  };

  useEffect(() => {
    if (report) {
      setWorkforce(parseJsonArray(report.workforce));
      setEquipment(parseJsonArray(report.equipmentUsed));
      setMaterials(parseJsonArray(report.materialReceived));
      setProgress(parseJsonArray(report.workProgress));
      setVisitors(parseJsonArray(report.siteVisits));
      setMeetings(parseJsonArray(report.meetings));
    }
  }, [report?.id]);

  const sectionStatus = useMemo(() => {
    if (!report) return {};
    return {
      weather: !!(report.weatherMorning || report.weatherAfternoon || report.maxTempC != null),
      workforce: workforce.some((r) => r.trade || r.headcount > 0 || r.company),
      equipment: equipment.some((r) => r.name || r.workingHours > 0 || r.fuel > 0),
      materials: materials.some((r) => r.name || r.qty > 0),
      progress: progress.some((r) => r.boqCode || r.boqDesc || r.actualQty > 0 || r.batchedQty > 0),
      photos: (report.attachments?.length ?? 0) > 0,
      visitors: visitors.some((r) => r.visitor || r.organization),
      meetings: meetings.some((r) => r.topic || r.attendees),
      problems: !!report.problems,
      safety: !!report.safetyNotes,
      remarks: !!report.remarks,
    };
  }, [report, workforce, equipment, materials, progress, visitors, meetings]);

  return {
    report,
    projectInfo,
    isLoading,
    isAdmin,
    canEdit,
    canDelete,
    staffList,
    equipmentList,
    activeSection,
    setActiveSection,
    saving,
    lastSaved,
    deleteOpen,
    setDeleteOpen,
    shareOpen,
    setShareOpen,
    justSubmitted,
    setJustSubmitted,
    workforce,
    setWorkforce,
    equipment,
    setEquipment,
    materials,
    setMaterials,
    progress,
    setProgress,
    visitors,
    setVisitors,
    meetings,
    setMeetings,
    syncing,
    copying,
    fetchingWeather,
    weatherNonce,
    saveField,
    handleCopyFromPrevious,
    handleSyncFromProgram,
    handleFetchWeather,
    sectionStatus,
    statusMutation,
    deleteMutation,
  };
}
