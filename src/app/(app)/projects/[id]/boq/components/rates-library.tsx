"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  ChevronUp,
  Calculator,
  Check,
  Folder,
  ChevronDown,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import { UNITS } from "../types";
import { InlineEdit } from "./inline-edit";
import { formatNpr } from "@/lib/currency";

const DISCIPLINE_TAGS = [
  "Civil & Concrete",
  "Steel & Rebar",
  "Plumbing & Sanitary",
  "Electrical & Power",
  "Finishes & Carpentry",
  "Labor",
  "Equipment & Machinery",
  "Fuel & Lubricants",
  "General Hardware",
];

export function RatesLibrary({ projectId, canWrite }: { projectId: string; canWrite: boolean }) {
  const utils = trpc.useUtils();
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileCategory, setNewProfileCategory] = useState<"district_rate" | "supplier_quotation" | "contractor_negotiated">("district_rate");

  // New Item State
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("Civil & Concrete");
  const [newItemSubCategory, setNewItemSubCategory] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("cum");
  const [newItemRate, setNewItemRate] = useState("");

  // Averager State
  const [showAverager, setShowAverager] = useState(false);
  const [avgName, setAvgName] = useState("");
  const [avgUnit, setAvgUnit] = useState("cum");
  const [avgR1, setAvgR1] = useState(""); const [_avgSup1, setAvgSup1] = useState("");
  const [avgR2, setAvgR2] = useState(""); const [_avgSup2, setAvgSup2] = useState("");
  const [avgR3, setAvgR3] = useState(""); const [_avgSup3, setAvgSup3] = useState("");

  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const { data: profilesData, isLoading } = trpc.rateProfile.list.useQuery({ projectId });

  const { data: profileDetail } = trpc.rateProfile.get.useQuery(
    { projectId, profileId: selectedProfile ?? "" },
    { enabled: !!selectedProfile }
  );

  const createProfile = trpc.rateProfile.create.useMutation({
    onSuccess: (d) => {
      utils.rateProfile.list.invalidate({ projectId });
      toast.success("Rate profile created");
      setNewProfileName("");
      setNewProfileCategory("district_rate");
      setSelectedProfile(d.profile.id);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteProfile = trpc.rateProfile.delete.useMutation({
    onSuccess: () => {
      utils.rateProfile.list.invalidate({ projectId });
      toast.success("Profile deleted");
      setSelectedProfile(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const addItem = trpc.rateProfile.addItem.useMutation({
    onSuccess: () => {
      utils.rateProfile.get.invalidate({ projectId, profileId: selectedProfile! });
      utils.rateProfile.list.invalidate({ projectId });
      toast.success("Rate added");
      setNewItemName(""); setNewItemSubCategory(""); setNewItemRate("");
    },
    onError: (e) => toast.error(e.message),
  });

  const addAveraged = trpc.rateProfile.addAveragedItem.useMutation({
    onSuccess: (d) => {
      utils.rateProfile.get.invalidate({ projectId, profileId: selectedProfile! });
      utils.rateProfile.list.invalidate({ projectId });
      toast.success(`Rate added (avg of ${d.ratesCount} quotes: NPR ${d.average})`);
      setAvgName(""); setAvgR1(""); setAvgR2(""); setAvgR3("");
      setAvgSup1(""); setAvgSup2(""); setAvgSup3("");
      setShowAverager(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateItem = trpc.rateProfile.updateItem.useMutation({
    onSuccess: () => {
      utils.rateProfile.get.invalidate({ projectId, profileId: selectedProfile! });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteItem = trpc.rateProfile.deleteItem.useMutation({
    onSuccess: () => {
      utils.rateProfile.get.invalidate({ projectId, profileId: selectedProfile! });
      utils.rateProfile.list.invalidate({ projectId });
      toast.success("Removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const CATEGORY_LABELS: Record<string, string> = {
    district_rate: "District Rate",
    supplier_quotation: "Supplier Quotation",
    contractor_negotiated: "Contractor Negotiated",
  };

  const CATEGORY_COLORS: Record<string, string> = {
    district_rate: "bg-info/15 text-info dark:bg-[var(--navy-deep)] dark:text-info",
    supplier_quotation: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    contractor_negotiated: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  };

  // Group items by Discipline/Trade Tag
  const items = profileDetail?.profile.items || [];
  const groupedItems = items.reduce((acc, item) => {
    const cat = item.category || "General Materials";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, typeof items>);

  const toggleCategoryCollapse = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Rate Profiles</h3>
          <p className="text-sm text-muted-foreground">
            Institution rate libraries organized by Trade Tags & Sub-Category Specs. Create profiles, fill rates, then batch-apply to BOQs.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isLoading ? <Skeleton className="h-8 w-48" /> : (
          <>
            {profilesData?.profiles.map((p) => {
              const badgeColor = CATEGORY_COLORS[p.category] ?? CATEGORY_COLORS.district_rate;
              return (
                <div key={p.id} className="flex items-center">
                  <Button
                    variant={selectedProfile === p.id ? "default" : "outline"}
                    size="sm" className="gap-1"
                    onClick={() => setSelectedProfile(p.id)}
                  >
                    {p.name}
                    <span className={`ml-1 rounded px-1 py-0.5 text-[9px] font-medium ${badgeColor}`}>
                      {CATEGORY_LABELS[p.category] ?? p.category}
                    </span>
                    {p.isDefault && <Badge variant="secondary" className="ml-1 text-[9px]">default</Badge>}
                    <span className="ml-1 text-[10px] text-muted-foreground">({p._count.items})</span>
                  </Button>
                  {canWrite && (
                    <button
                      onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteProfile.mutate({ projectId, profileId: p.id }); }}
                      className="ml-1 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Delete profile"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
            {canWrite && (
              <div className="flex items-center gap-1">
                <Input
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="New profile name"
                  className="h-8 w-44 text-xs"
                  onKeyDown={(e) => { if (e.key === "Enter" && newProfileName) createProfile.mutate({ projectId, name: newProfileName, category: newProfileCategory, isDefault: profilesData?.profiles.length === 0 }); }}
                />
                <select
                  value={newProfileCategory}
                  onChange={(e) => setNewProfileCategory(e.target.value as "district_rate" | "supplier_quotation" | "contractor_negotiated")}
                  className="h-8 rounded border bg-background px-1 text-xs"
                >
                  <option value="district_rate">District Rate</option>
                  <option value="supplier_quotation">Supplier Quotation</option>
                  <option value="contractor_negotiated">Contractor Negotiated</option>
                </select>
                <Button size="sm" variant="outline" className="h-8 px-2" disabled={!newProfileName || createProfile.isPending} onClick={() => createProfile.mutate({ projectId, name: newProfileName, category: newProfileCategory, isDefault: profilesData?.profiles.length === 0 })}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {selectedProfile && profileDetail ? (
        <Card className="overflow-hidden border shadow-2xs space-y-4 p-4">
          {/* Quick Add Row */}
          {canWrite && (
            <div className="bg-muted/20 border p-3 rounded-lg space-y-2">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-info" /> Add Material Rate to Profile
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Discipline Tag</label>
                  <select
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(e.target.value)}
                    className="h-8 w-full rounded border bg-background px-2 text-xs"
                  >
                    {DISCIPLINE_TAGS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Material Name *</label>
                  <Input
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="e.g. Cement / Rebar"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Size / Spec Rating</label>
                  <Input
                    value={newItemSubCategory}
                    onChange={(e) => setNewItemSubCategory(e.target.value)}
                    placeholder="e.g. 53 Grade / 20mm"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Unit</label>
                  <select
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                    className="h-8 w-full rounded border bg-background px-2 text-xs"
                  >
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Rate (NPR)</label>
                  <div className="flex gap-1.5">
                    <Input
                      value={newItemRate}
                      onChange={(e) => setNewItemRate(e.target.value)}
                      type="number"
                      placeholder="0.00"
                      className="h-8 text-xs font-mono text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <Button
                      size="sm"
                      className="h-8 px-3 bg-success hover:bg-success text-white"
                      disabled={!newItemName || addItem.isPending}
                      onClick={() => addItem.mutate({
                        projectId,
                        profileId: selectedProfile,
                        materialName: newItemName,
                        category: newItemCategory,
                        subCategory: newItemSubCategory || undefined,
                        unit: newItemUnit,
                        rate: parseFloat(newItemRate) || 0
                      })}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Grouped Table View */}
          {Object.keys(groupedItems).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No rates added to this profile yet. Use the form above to add material rates.
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(groupedItems).map(([categoryGroup, groupItems]) => {
                const isCollapsed = collapsedCategories[categoryGroup];
                return (
                  <div key={categoryGroup} className="border rounded-lg overflow-hidden">
                    <div
                      onClick={() => toggleCategoryCollapse(categoryGroup)}
                      className="flex items-center justify-between p-2.5 bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors border-b"
                    >
                      <div className="flex items-center gap-2">
                        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-amber-600" />}
                        <Folder className="h-3.5 w-3.5 text-amber-500" />
                        <span className="font-bold text-xs">{categoryGroup}</span>
                        <Badge variant="secondary" className="text-[9px] font-mono">
                          {groupItems.length} items
                        </Badge>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="border-b bg-muted/10 text-muted-foreground">
                            <tr>
                              <th className="p-2.5 font-semibold">Material Name</th>
                              <th className="p-2.5 font-semibold">Size / Spec Rating</th>
                              <th className="p-2.5 font-semibold">Unit</th>
                              <th className="p-2.5 text-right font-semibold">Rate (NPR)</th>
                              {canWrite && <th className="w-12 p-2.5 text-center">Actions</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {groupItems.map((item) => (
                              <tr key={item.id} className="border-b last:border-b-0 hover:bg-muted/20">
                                <td className="p-2.5 font-semibold text-foreground">
                                  {canWrite ? (
                                    <InlineEdit value={item.materialName} onSave={(v) => updateItem.mutate({ projectId, profileId: selectedProfile, itemId: item.id, materialName: v })} className="w-44" />
                                  ) : item.materialName}
                                </td>
                                <td className="p-2.5">
                                  {item.subCategory ? (
                                    <Badge variant="outline" className="bg-info/60 text-info dark:bg-[var(--navy-deep)]/40 dark:text-info/80 border-info/30 text-[9px] font-mono">
                                      {item.subCategory}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground/40 text-[10px] italic">Standard</span>
                                  )}
                                </td>
                                <td className="p-2.5 font-mono text-muted-foreground">{item.unit}</td>
                                <td className="p-2.5 text-right font-mono font-bold text-success">
                                  {canWrite ? (
                                    <InlineEdit value={item.rate.toString()} onSave={(v) => updateItem.mutate({ projectId, profileId: selectedProfile, itemId: item.id, rate: parseFloat(v) || 0 })} className="w-24 text-right" />
                                  ) : formatNpr(item.rate)}
                                </td>
                                {canWrite && (
                                  <td className="p-2.5 text-center">
                                    <button
                                      onClick={() => deleteItem.mutate({ projectId, profileId: selectedProfile, itemId: item.id })}
                                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                      title="Delete rate"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {canWrite && (
            <div className="flex items-center gap-2 border-t pt-3">
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setShowAverager(!showAverager)}>
                {showAverager ? <ChevronUp className="h-3 w-3" /> : <Calculator className="h-3 w-3" />}
                Quotation Averaging Tool
              </Button>
            </div>
          )}

          {showAverager && (
            <div className="border-t bg-amber-50/50 p-3 dark:bg-amber-950/20 rounded-lg">
              <div className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-300">
                Enter up to 3 supplier rates; the system averages them automatically into the rate profile.
              </div>
              <div className="grid grid-cols-5 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">Material Name</label>
                  <input value={avgName} onChange={(e) => setAvgName(e.target.value)} placeholder="e.g. Cement OPC" className="h-7 w-full rounded border bg-background px-1 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">Unit</label>
                  <select value={avgUnit} onChange={(e) => setAvgUnit(e.target.value)} className="h-7 w-full rounded border bg-background px-1 text-xs">
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">Quote 1 (NPR)</label>
                  <input value={avgR1} onChange={(e) => setAvgR1(e.target.value)} type="number" placeholder="0" className="h-7 w-full rounded border bg-background px-1 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">Quote 2 (NPR)</label>
                  <input value={avgR2} onChange={(e) => setAvgR2(e.target.value)} type="number" placeholder="0" className="h-7 w-full rounded border bg-background px-1 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">Quote 3 (NPR)</label>
                  <input value={avgR3} onChange={(e) => setAvgR3(e.target.value)} type="number" placeholder="0" className="h-7 w-full rounded border bg-background px-1 text-xs" />
                </div>
              </div>
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  disabled={!avgName || addAveraged.isPending}
                  onClick={() => addAveraged.mutate({
                    projectId,
                    profileId: selectedProfile,
                    materialName: avgName,
                    unit: avgUnit,
                    rate1: parseFloat(avgR1) || 0,
                    rate2: parseFloat(avgR2) || 0,
                    rate3: parseFloat(avgR3) || undefined,
                  })}
                  className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                >
                  Calculate & Add Averaged Rate
                </Button>
              </div>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
