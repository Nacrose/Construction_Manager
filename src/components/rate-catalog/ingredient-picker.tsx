"use client";

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string, catalogItem?: { id: string; name: string; unit: string }) => void;
  organizationId?: string;
  className?: string;
  placeholder?: string;
};

export function IngredientPicker({ value, onChange, organizationId, className, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [showCreate, setShowCreate] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: searchData, isLoading } = trpc.catalogV2.search.useQuery(
    { q: query, organizationId, limit: 8 },
    { enabled: query.length >= 1 && open },
  );

  const items = (searchData?.materials ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category ?? null,
    defaultUnit: m.defaultUnit ?? "",
  }));
  const isExactMatch = items.some(
    (i) => i.name.toLowerCase() === query.toLowerCase().trim(),
  );
  const showSuggestions = open && query.length >= 1;
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

  function select(item: (typeof items)[0]) {
    setQuery(item.name);
    onChange(item.name, { id: item.id, name: item.name, unit: item.defaultUnit ?? "" });
    setOpen(false);
    setShowCreate(false);
  }

  const createMaterialMutation = trpc.catalogV2.createMaterial.useMutation({
    onSuccess: (data) => {
      const created = data.material;
      setQuery(created.name);
      onChange(created.name, { id: created.id, name: created.name, unit: created.defaultUnit ?? "" });
      toast.success(`Added "${created.name}" to catalog`);
      setOpen(false);
      setShowCreate(false);
    },
    onError: (e) => toast.error(e.message),
  });

  async function handleCreate() {
    if (!query.trim()) return;
    setCreating(true);
    try {
      await createMaterialMutation.mutateAsync({
        scope: "org",
        name: query.trim(),
        category: newCategory || undefined,
        defaultUnit: newUnit || undefined,
      });
    } finally {
      setCreating(false);
    }
  }

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
        placeholder={placeholder ?? "Search or type material name..."}
        className="h-8 text-sm"
      />

      {showSuggestions && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border bg-popover shadow-lg overflow-hidden">
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
                  Did you mean one of these?
                </div>
              )}
              <div className="max-h-48 overflow-y-auto">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors border-b border-border/30 last:border-0"
                    onClick={() => select(item)}
                  >
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span className="flex-1 truncate">{item.name}</span>
                    {item.category && (
                      <span className="text-[10px] text-muted-foreground capitalize px-1.5 py-0.5 rounded bg-muted">
                        {item.category}
                      </span>
                    )}
                    {item.defaultUnit && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {item.defaultUnit}
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
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors border-t border-border/40"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>
                Add &ldquo;<span className="font-medium">{query.trim()}</span>
                &rdquo; to catalog
              </span>
            </button>
          )}

          {!isLoading && items.length === 0 && query.trim().length >= 2 && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              <p className="mb-2">No materials found for &ldquo;{query.trim()}&rdquo;</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="h-3 w-3 mr-1" /> Add to catalog
              </Button>
            </div>
          )}

          {showCreate && (
            <div className="border-t p-3 space-y-2 bg-muted/30">
              <p className="text-xs font-medium">
                Add &ldquo;{query.trim()}&rdquo; to catalog
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Category (e.g. Cement)"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="h-8 text-xs flex-1"
                />
                <Input
                  placeholder="Unit"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  className="h-8 text-xs w-24"
                />
                <Button
                  size="sm"
                  className="h-8"
                  onClick={handleCreate}
                  disabled={creating}
                >
                  {creating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
