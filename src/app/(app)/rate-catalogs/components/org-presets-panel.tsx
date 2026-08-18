"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BookTemplate, Upload } from "lucide-react";
import { toast } from "sonner";

export function OrgPresetsPanel() {
  const utils = trpc.useUtils();
  const { data: globalData } = trpc.globalPreset.listOrg.useQuery({ includeGlobal: true });
  const [search, setSearch] = useState("");
  const [, setShowImport] = useState(false);
  const [, setImportId] = useState("");

  const presets = (globalData?.presets ?? []).filter((p: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
  });

  const importGlobal = trpc.globalPreset.importGlobal.useMutation({
    onSuccess: () => {
      utils.globalPreset.listOrg.invalidate();
      setShowImport(false);
      toast.success("Preset imported");
    },
    onError: (e) => toast.error(e.message),
  });

  const globalPresets = presets.filter((p: any) => p.organizationId === null);
  const orgPresets = presets.filter((p: any) => p.organizationId !== null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search presets..."
          className="h-8 text-sm max-w-xs"
        />
        <Button size="sm" onClick={() => setShowImport(true)}>
          <Upload className="h-4 w-4 mr-1" /> Import Global
        </Button>
      </div>

      {orgPresets.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase">Imported Presets</p>
          {orgPresets.map((p: any) => (
            <Card key={p.id} className="p-3">
              <div className="flex items-center gap-3">
                <BookTemplate className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <span className="text-sm font-medium">{p.name}</span>
                  <Badge variant="secondary" className="text-[9px] ml-2">
                    {p.category}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {p._count.ingredients} ingredients
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {globalPresets.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Global Presets (available for import)
          </p>
          <div className="space-y-2">
            {globalPresets.map((p: any) => (
              <Card key={p.id} className="p-3 opacity-60">
                <div className="flex items-center gap-3">
                  <BookTemplate className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm font-medium">{p.name}</span>
                    <Badge variant="outline" className="text-[9px] ml-2">
                      Global
                    </Badge>
                    <Badge variant="secondary" className="text-[9px]">
                      {p.category}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {p._count.ingredients} ingredients
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      setImportId(p.id);
                      importGlobal.mutate({ presetId: p.id });
                    }}
                  >
                    Import
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {presets.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <BookTemplate className="mx-auto h-8 w-8 mb-2 opacity-40" /> No presets available.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
