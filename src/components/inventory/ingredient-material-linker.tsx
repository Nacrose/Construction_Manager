"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Link2, Unlink, Wand2, Loader2, CheckCircle2, AlertCircle, Package,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
};

export function IngredientMaterialLinker({ projectId }: Props) {
  const utils = trpc.useUtils();
  const [showAll, setShowAll] = useState(false); // false = only show unlinked

  const { data: materialsData } = trpc.material.list.useQuery({ projectId });
  const materials = materialsData?.materials ?? [];

  const { data: linksData, isLoading } = trpc.material.ingredientLinks.useQuery({ projectId });

  const linkMut = trpc.material.linkIngredient.useMutation({
    onSuccess: () => {
      utils.material.ingredientLinks.invalidate({ projectId });
      toast.success("Ingredient linked");
    },
    onError: (e) => toast.error(e.message),
  });

  const autoMatchMut = trpc.material.autoMatchIngredients.useMutation({
    onSuccess: (result) => {
      utils.material.ingredientLinks.invalidate({ projectId });
      if (result.matched > 0) {
        toast.success(`Auto-matched ${result.matched} of ${result.total} ingredients`);
      }
      if (result.unmatched > 0) {
        const names = result.unmatchedNames ?? [];
        toast.info(`${result.unmatched} couldn't be matched: ${names.slice(0, 5).join(", ")}${names.length > 5 ? "..." : ""}`);
      }
      if (result.total === 0) {
        toast.info("All ingredients are already linked");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const allIngredients = linksData?.ingredients ?? [];
  const unlinked = allIngredients.filter(i => !i.materialId);
  const linked = allIngredients.filter(i => i.materialId);
  const displayed = showAll ? allIngredients : unlinked;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Link2 className="h-4 w-4" /> Ingredient ↔ Material Linking
            </CardTitle>
            <CardDescription className="text-xs">
              Link BOQ ingredients to inventory materials for auto-deduction.
              {unlinked.length > 0 && ` ${unlinked.length} unlinked.`}
              {unlinked.length === 0 && linked.length > 0 && ` All ${linked.length} linked ✓`}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => autoMatchMut.mutate({ projectId })}
            disabled={autoMatchMut.isPending || unlinked.length === 0}
          >
            {autoMatchMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
            Auto-Match
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : allIngredients.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No BOQ ingredients found.</p>
            <p className="mt-1">Add rate analysis ingredients to BOQ items first.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Stats bar */}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                {linked.length} linked
              </span>
              <span className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3 text-amber-500" />
                {unlinked.length} unlinked
              </span>
              <button
                onClick={() => setShowAll(!showAll)}
                className="ml-auto text-primary hover:underline"
              >
                {showAll ? "Show unlinked only" : "Show all"}
              </button>
            </div>

            {/* Ingredient list */}
            {displayed.length === 0 ? (
              <div className="text-center py-4 text-xs text-emerald-600">
                <CheckCircle2 className="h-6 w-6 mx-auto mb-1" />
                All ingredients are linked!
              </div>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {displayed.map(ing => (
                  <div key={ing.id} className="flex items-center gap-2 rounded border p-1.5 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{ing.name}</div>
                      <div className="text-[9px] text-muted-foreground">
                        {ing.boqItem.code} · {ing.quantity} {ing.unit}/unit
                        {ing.material && (
                          <span className="text-emerald-600"> → {ing.material.name}</span>
                        )}
                      </div>
                    </div>
                    <Select
                      value={ing.materialId ?? "none"}
                      onValueChange={(v) => {
                        linkMut.mutate({
                          ingredientId: ing.id,
                          materialId: v === "none" ? null : v,
                          projectId,
                        });
                      }}
                    >
                      <SelectTrigger className="h-7 w-40 text-[10px]">
                        <SelectValue placeholder="— Select —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Unlinked —</SelectItem>
                        {materials.map(m => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name} ({m.currentStock} {m.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}

            {/* Helper text */}
            <div className="text-[10px] text-muted-foreground bg-muted/30 rounded p-2">
              <p className="font-medium mb-0.5">How auto-deduction works:</p>
              <p>When a daily report is submitted with actual quantities, the system looks up each BOQ item's ingredients.
              If an ingredient is linked to a Material (via the dropdown above), the exact quantity is deducted from inventory
              with a log like: <em>"50.00 bag of Cement used for Excavation (BOQ 1.2.3)"</em>.
              Unlinked ingredients are skipped — so link everything for accurate stock tracking.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
