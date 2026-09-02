"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen, Copy, Plus, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export function CreateRateCatalogDialog({
  open,
  onOpenChange,
  projectId,
  scope = "project",
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  scope?: "global" | "org" | "project";
  onSuccess?: (newCatalogId: string) => void;
}) {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"adopt" | "scratch">("adopt");
  const [sourceCatalogId, setSourceCatalogId] = useState("");
  const [name, setName] = useState("");
  const [fiscalYear, setFiscalYear] = useState("2081/82");
  const [districtsInput, setDistrictsInput] = useState("Kathmandu");

  // Query parent catalogs for adoption
  const { data: globalData } = trpc.catalogV2.listRateCatalogs.useQuery({ scope: "global" });
  const { data: orgData } = trpc.catalogV2.listRateCatalogs.useQuery({ scope: "org" });

  const parentCatalogs = [
    ...(orgData?.catalogs || []).map((c) => ({ ...c, scopeLabel: "Org" })),
    ...(globalData?.catalogs || []).map((c) => ({ ...c, scopeLabel: "Global" })),
  ];

  const createMut = trpc.catalogV2.createRateCatalog.useMutation({
    onSuccess: (res) => {
      utils.catalogV2.listRateCatalogs.invalidate();
      toast.success(`Rate catalog "${res.catalog.name}" created successfully!`);
      onOpenChange(false);
      setName("");
      setSourceCatalogId("");
      onSuccess?.(res.catalog.id);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "adopt") {
      const selectedParent = parentCatalogs.find((c) => c.id === sourceCatalogId);
      const catalogName = name.trim() || selectedParent?.name || "Project Rate Catalog";
      const fy = fiscalYear.trim() || selectedParent?.fiscalYear || "2081/82";
      createMut.mutate({
        scope,
        projectId,
        name: catalogName,
        fiscalYear: fy,
        sourceCatalogId,
        districts: selectedParent?.districts || ["Kathmandu"],
      });
    } else {
      if (!name.trim()) {
        toast.error("Please enter a catalog name.");
        return;
      }
      const districts = districtsInput
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      createMut.mutate({
        scope,
        projectId,
        name: name.trim(),
        fiscalYear: fiscalYear.trim() || "2081/82",
        districts: districts.length > 0 ? districts : ["Kathmandu"],
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-amber-500" />
              {scope === "project" ? "Create Project Rate Catalog" : "Create Rate Catalog"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {scope === "project"
                ? "Set up a rate catalog for this project to manage district material and labor rates."
                : "Create a new rate book."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {parentCatalogs.length > 0 && (
              <div className="grid grid-cols-2 gap-2 bg-muted p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setMode("adopt")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    mode === "adopt"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Copy className="h-3.5 w-3.5 text-info" /> Adopt Parent Catalog
                </button>
                <button
                  type="button"
                  onClick={() => setMode("scratch")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    mode === "scratch"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Plus className="h-3.5 w-3.5 text-amber-500" /> Create from Scratch
                </button>
              </div>
            )}

            {mode === "adopt" && parentCatalogs.length > 0 ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Select Source Rate Catalog</Label>
                  <Select
                    value={sourceCatalogId}
                    onValueChange={(val) => {
                      setSourceCatalogId(val);
                      const cat = parentCatalogs.find((c) => c.id === val);
                      if (cat) {
                        if (!name) setName(`${cat.name} (Project Copy)`);
                        setFiscalYear(cat.fiscalYear);
                      }
                    }}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Choose a parent rate book..." />
                    </SelectTrigger>
                    <SelectContent>
                      {parentCatalogs.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          <span className="font-semibold">[{c.scopeLabel}]</span> {c.name} ({c.fiscalYear})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    All material rates and districts from the selected catalog will be copied into your project.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Catalog Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Kathmandu Project Rates 2081/82"
                    className="text-xs"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Catalog Name *</Label>
                  <Input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Kathmandu–Bhaktapur Highway Rates"
                    className="text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Fiscal Year</Label>
                    <Input
                      value={fiscalYear}
                      onChange={(e) => setFiscalYear(e.target.value)}
                      placeholder="2081/82"
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Districts (comma separated)</Label>
                    <Input
                      value={districtsInput}
                      onChange={(e) => setDistrictsInput(e.target.value)}
                      placeholder="Kathmandu, Lalitpur"
                      className="text-xs"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={createMut.isPending || (mode === "adopt" && !sourceCatalogId)}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            >
              {createMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {mode === "adopt" ? "Adopt & Create Catalog" : "Create Catalog"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
