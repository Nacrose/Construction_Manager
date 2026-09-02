"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  MODULE_DEFINITIONS,
  ModuleKey,
  groupModules,
  isModuleEnabled,
  buildPresetModules,
  ModulePreset,
  PRESET_METADATA,
} from "@/lib/project-modules";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Layers, Copy, Save, Lock, Sparkles, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectModulesTabProps {
  projectId: string;
  canManage: boolean;
}

export function ProjectModulesTab({ projectId, canManage }: ProjectModulesTabProps) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.project.getModules.useQuery({ projectId });
  const { data: projectsData } = trpc.project.list.useQuery();

  const [activePreset, setActivePreset] = useState<ModulePreset>("record_keeper");
  const [localModules, setLocalModules] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  const updateModules = trpc.project.updateModules.useMutation({
    onSuccess: () => {
      toast.success("Project module configuration saved.");
      utils.project.getModules.invalidate({ projectId });
      setDirty(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const copyModules = trpc.project.copyModulesFrom.useMutation({
    onSuccess: () => {
      toast.success("Module configuration copied.");
      utils.project.getModules.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (data?.modules) {
      setLocalModules(data.modules);
      if (data.operationalPreset) {
        setActivePreset(data.operationalPreset);
      }
      setDirty(false);
    }
  }, [data]);

  function toggle(key: ModuleKey, enabled: boolean) {
    const next = { ...localModules, [key]: enabled };
    if (enabled) delete next[key];
    setLocalModules(next);
    setDirty(true);
  }

  function applyPreset(preset: ModulePreset) {
    setActivePreset(preset);
    const next = buildPresetModules(preset);
    setLocalModules(next);
    setDirty(true);
  }

  function handleSave() {
    updateModules.mutate({
      projectId,
      modules: localModules,
      operationalPreset: (activePreset === "simple" ? "record_keeper" : activePreset === "standard" ? "lean" : activePreset === "full" ? "enterprise" : activePreset) as any,
    });
  }

  const grouped = groupModules();
  const otherProjects = projectsData?.projects.filter((p) => p.id !== projectId) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {/* Top Banner: 3 Operational Presets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-bold text-foreground">Contractor Scale & Operational Presets</h3>
          </div>
          {canManage && dirty && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateModules.isPending}
              className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-foreground font-bold shadow-md"
            >
              <Save className="h-3.5 w-3.5" />
              Save Configuration
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(["record_keeper", "lean", "enterprise"] as const).map((presetKey) => {
            const meta = PRESET_METADATA[presetKey];
            const isCurrent = activePreset === presetKey || (presetKey === "record_keeper" && activePreset === "simple") || (presetKey === "lean" && activePreset === "standard") || (presetKey === "enterprise" && activePreset === "full");

            return (
              <div
                key={presetKey}
                onClick={() => canManage && applyPreset(presetKey)}
                className={cn(
                  "p-3.5 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between",
                  isCurrent
                    ? "border-emerald-500/60 bg-emerald-950/20 shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/40"
                    : "border-[var(--border)] bg-card hover:border-[var(--primary)] hover:bg-card/[0.02]"
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{meta.icon}</span>
                      <span className="text-xs font-bold text-foreground">{meta.title}</span>
                    </div>
                    {isCurrent && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {meta.subtitle}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-[var(--input)] flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{presetKey === "record_keeper" ? "11 Core + Equipment" : presetKey === "lean" ? "11 Core + Lookahead" : "All 24 Enterprise Tools"}</span>
                  <span className={cn("font-medium", isCurrent ? "text-emerald-400 font-bold" : "text-muted-foreground")}>
                    {isCurrent ? "Active Preset" : "Click to Apply"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Manual Granular Switchboard */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Layers className="h-4 w-4 text-emerald-400" />
            <span className="font-semibold text-foreground">Granular Feature Switchboard</span>
            <span>— Fine-tune any individual module on or off</span>
          </div>

          {canManage && otherProjects.length > 0 && (
            <Select
              onValueChange={(sourceId) =>
                copyModules.mutate({ targetProjectId: projectId, sourceProjectId: sourceId })
              }
            >
              <SelectTrigger className="h-8 w-[190px] text-xs bg-card border-[var(--border)] text-foreground">
                <Copy className="h-3 w-3 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Copy from project…" />
              </SelectTrigger>
              <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs">
                {otherProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Grouped Modules */}
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([group, mods]) => (
            <div key={group} className="space-y-1.5">
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground font-bold px-1">
                {group}
              </p>
              <div className="rounded-xl border border-[var(--border)] divide-y divide-white/10 bg-card overflow-hidden">
                {mods.map((mod) => {
                  const enabled = isModuleEnabled(localModules, mod.key);
                  return (
                    <div
                      key={mod.key}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 transition-colors",
                        mod.core ? "bg-card/[0.02]" : "hover:bg-card/[0.02]"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">
                            {mod.label}
                          </span>
                          {mod.core ? (
                            <Badge variant="outline" className="h-4 px-1.5 text-[9px] gap-1 text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                              <Lock className="h-2.5 w-2.5" />
                              Core Pillar (Locked ON)
                            </Badge>
                          ) : enabled ? (
                            <Badge variant="outline" className="h-4 px-1.5 text-[9px] text-foreground/80 border-[var(--border)]">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="h-4 px-1.5 text-[9px] bg-red-500/10 text-red-400 border border-red-500/20">
                              Hidden
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {mod.description}
                        </p>
                      </div>

                      <Switch
                        id={`module-toggle-${mod.key}`}
                        checked={enabled}
                        disabled={mod.core || !canManage}
                        onCheckedChange={(val) => toggle(mod.key, val)}
                        className="shrink-0"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!canManage && (
        <p className="text-xs text-muted-foreground text-center pt-2">
          Only project managers or org administrators can customize project module configurations.
        </p>
      )}
    </div>
  );
}
