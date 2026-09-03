"use client";

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, AlertTriangle, Check, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SelectedResource = {
  id: string; // material.id (Project Resource Library)
  name: string;
  unit: string;
  catalogMaterialId?: string | null;
};

type Props = {
  value: string;
  onChange: (value: string, resource?: SelectedResource) => void;
  projectId?: string;
  organizationId?: string;
  resourceType?: "material" | "labor" | "equipment";
  className?: string;
  placeholder?: string;
};

export function IngredientPicker({
  value,
  onChange,
  projectId,
  organizationId,
  resourceType = "material",
  className,
  placeholder,
}: Props) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [showCreate, setShowCreate] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal state with external value if changed from outside
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // If projectId is provided, search from project Resource Library; otherwise fallback to catalog search
  const { data: projectResources, isLoading: isProjectLoading } = trpc.material.listByType.useQuery(
    { projectId: projectId!, resourceType, search: query, limit: 500 },
    { enabled: !!projectId && open }
  );

  const { data: catalogData, isLoading: isCatalogLoading } = trpc.catalogV2.search.useQuery(
    { q: query, organizationId, limit: 8 },
    { enabled: !projectId && query.length >= 1 && open }
  );

  const isLoading = projectId ? isProjectLoading : isCatalogLoading;

  const items: SelectedResource[] = projectId
    ? (projectResources?.items ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        unit: m.unit,
        catalogMaterialId: m.catalogMaterialId,
      }))
    : (catalogData?.materials ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        unit: m.defaultUnit ?? "",
        catalogMaterialId: m.id,
      }));

  const isExactMatch = items.some(
    (i) => i.name.toLowerCase().trim() === query.toLowerCase().trim()
  );
  const showSuggestions = open;
  const showFuzzyWarning = !isExactMatch && query.length >= 2 && items.length > 0;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function select(item: SelectedResource) {
    setQuery(item.name);
    onChange(item.name, item);
    setOpen(false);
    setShowCreate(false);
  }

  const createProjectMaterialMutation = trpc.material.create.useMutation({
    onSuccess: (data) => {
      const created = data.material;
      utils.material.listByType.invalidate();
      setQuery(created.name);
      onChange(created.name, {
        id: created.id,
        name: created.name,
        unit: created.unit,
        catalogMaterialId: created.catalogMaterialId,
      });
      toast.success(`Added "${created.name}" to Resource Library`);
      setOpen(false);
      setShowCreate(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const createCatalogMaterialMutation = trpc.catalogV2.createMaterial.useMutation({
    onSuccess: (data) => {
      const created = data.material;
      setQuery(created.name);
      onChange(created.name, {
        id: created.id,
        name: created.name,
        unit: created.defaultUnit ?? "",
        catalogMaterialId: created.id,
      });
      toast.success(`Added "${created.name}" to Catalog`);
      setOpen(false);
      setShowCreate(false);
    },
    onError: (e) => toast.error(e.message),
  });

  async function handleCreate() {
    if (!query.trim()) return;
    setCreating(true);
    try {
      if (projectId) {
        await createProjectMaterialMutation.mutateAsync({
          projectId,
          resourceType,
          name: query.trim(),
          category: newCategory || undefined,
          unit: newUnit || (resourceType === "labor" ? "day" : resourceType === "equipment" ? "hr" : "cum"),
        });
      } else {
        await createCatalogMaterialMutation.mutateAsync({
          scope: "org",
          resourceType,
          name: query.trim(),
          category: newCategory || undefined,
          defaultUnit: newUnit || (resourceType === "labor" ? "day" : resourceType === "equipment" ? "hr" : "cum"),
        });
      }
    } finally {
      setCreating(false);
    }
  }

  const placeholderText =
    placeholder ??
    (resourceType === "labor"
      ? "Search labor (e.g. Mason, Welder)..."
      : resourceType === "equipment"
      ? "Search equipment (e.g. Excavator, Roller)..."
      : "Search material (e.g. Cement, Rebar)...");

  return (
    <div ref={ref} className={cn("relative", className)}>
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value) {
            onChange("", undefined);
          }
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholderText}
        className="h-8 text-xs"
      />

      {showSuggestions && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border bg-popover shadow-lg overflow-hidden min-w-[220px]">
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && items.length > 0 && (
            <>
              {showFuzzyWarning && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-b">
                  <AlertTriangle className="h-3 w-3" />
                  Select from Resource Library:
                </div>
              )}
              <div className="max-h-48 overflow-y-auto">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted transition-colors border-b border-border/30 last:border-0"
                    onClick={() => select(item)}
                  >
                    <Check className="h-3.5 w-3.5 text-success/90 shrink-0" />
                    <span className="flex-1 truncate font-medium">{item.name}</span>
                    {item.unit && (
                      <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1 py-0.5 rounded">
                        {item.unit}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          {!isLoading && query.trim().length >= 1 && !isExactMatch && (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted transition-colors border-t border-border/40 text-primary"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span>
                Add &ldquo;<span className="font-semibold">{query.trim()}</span>
                &rdquo; to {projectId ? "Resource Library" : "Catalog"}
              </span>
            </button>
          )}

          {!isLoading && items.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              <p className="mb-2">
                No {resourceType} found in {projectId ? "Project Resource Library" : "Catalog"}.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="h-3 w-3 mr-1" /> Add to {projectId ? "Resource Library" : "Catalog"}
              </Button>
            </div>
          )}

          {showCreate && (
            <div className="border-t p-2.5 space-y-2 bg-muted/30">
              <p className="text-[11px] font-medium text-foreground">
                Add &ldquo;{query.trim()}&rdquo; as {resourceType}
              </p>
              <div className="flex gap-1.5">
                <Input
                  placeholder="Category (optional)"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="h-7 text-xs flex-1"
                />
                <Input
                  placeholder="Unit (e.g. day, hr, cum)"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  className="h-7 text-xs w-20"
                />
                <Button
                  size="sm"
                  className="h-7 px-2.5"
                  onClick={handleCreate}
                  disabled={creating}
                >
                  {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
