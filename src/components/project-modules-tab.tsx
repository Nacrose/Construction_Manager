"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import { MODULE_DEFINITIONS, ModuleKey, groupModules, isModuleEnabled, buildPresetModules, ModulePreset } from "@/lib/project-modules";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Layers, Copy, RotateCcw, Save, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectModulesTabProps {
  projectId: string;
  canManage: boolean;
}

export function ProjectModulesTab({ projectId, canManage }: ProjectModulesTabProps) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.project.getModules.useQuery({ projectId });
  const { data: projectsData } = trpc.project.list.useQuery();

  const updateModules = trpc.project.updateModules.useMutation({
    onSuccess: () => {
      toast.success("Module settings saved.");
      utils.project.getModules.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  const copyModules = trpc.project.copyModulesFrom.useMutation({
    onSuccess: () => {
      toast.success("Module settings copied.");
      utils.project.getModules.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  const [localModules, setLocalModules] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.modules) {
      setLocalModules(data.modules);
      setDirty(false);
    }
  }, [data]);

  function toggle(key: ModuleKey, enabled: boolean) {
    const next = { ...localModules, [key]: enabled };
    // if enabling, remove the false key entirely (cleaner JSON)
    if (enabled) delete next[key];
    setLocalModules(next);
    setDirty(true);
  }

  function applyPreset(preset: ModulePreset) {
    const next = buildPresetModules(preset);
    setLocalModules(next);
    setDirty(true);
  }

  function handleSave() {
    updateModules.mutate({ projectId, modules: localModules });
    setDirty(false);
  }

  const grouped = groupModules();
  const otherProjects = projectsData?.projects.filter((p) => p.id !== projectId) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Layers className="h-4 w-4" />
          <span className="font-medium text-foreground">Module Visibility</span>
          <span className="text-xs">— hidden modules are removed from navigation</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Preset selector */}
          {canManage && (
            <Select onValueChange={(v) => applyPreset(v as ModulePreset)}>
              <SelectTrigger className="h-8 w-[140px] text-xs" id="module-preset-select">
                <SelectValue placeholder="Apply preset…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">Simple</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="full">Full</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Copy from project */}
          {canManage && otherProjects.length > 0 && (
            <Select
              onValueChange={(sourceId) =>
                copyModules.mutate({ targetProjectId: projectId, sourceProjectId: sourceId })
              }
            >
              <SelectTrigger className="h-8 w-[170px] text-xs" id="copy-modules-select">
                <Copy className="h-3 w-3 mr-1.5" />
                <SelectValue placeholder="Copy from project…" />
              </SelectTrigger>
              <SelectContent>
                {otherProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Save button */}
          {canManage && dirty && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleSave}
              disabled={updateModules.isPending}
              id="save-module-settings-btn"
            >
              <Save className="h-3.5 w-3.5" />
              Save changes
            </Button>
          )}
        </div>
      </div>

      {/* Module groups */}
      <div className="space-y-5">
        {Array.from(grouped.entries()).map(([group, mods]) => (
          <div key={group}>
            <p className="mb-2 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              {group}
            </p>
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {mods.map((mod) => {
                const enabled = isModuleEnabled(localModules, mod.key);
                return (
                  <div
                    key={mod.key}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 transition-colors",
                      mod.core ? "bg-muted/30" : "bg-card hover:bg-muted/20"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {mod.label}
                        </span>
                        {mod.core && (
                          <Badge variant="outline" className="h-4 px-1.5 text-[10px] gap-1 text-muted-foreground border-muted-foreground/30">
                            <Lock className="h-2.5 w-2.5" />
                            Core
                          </Badge>
                        )}
                        {!mod.core && !enabled && (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                            Hidden
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
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

      {!canManage && (
        <p className="text-xs text-muted-foreground text-center pt-2">
          Only project managers can change module settings.
        </p>
      )}
    </div>
  );
}
