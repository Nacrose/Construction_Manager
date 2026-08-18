"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Building2, Loader2, Trash2, Calculator, Info, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function VendorDetailFullPage({
  partner,
  projectId,
  canWrite,
  onBack,
  onDone,
}: {
  partner: any;
  projectId: string;
  canWrite: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const [materialName, setMaterialName] = useState("");
  const [unit, setUnit] = useState("ton");
  const [brand, setBrand] = useState("");
  const [specType, setSpecType] = useState("");
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [exFactoryRate, setExFactoryRate] = useState<number>(0);
  const [transportRate, setTransportRate] = useState<number>(0);
  const [notes, setNotes] = useState("");

  const { data: materialsData } = trpc.material.list.useQuery({ projectId });

  // Calculator state
  const [calcItem, setCalcItem] = useState<any | null>(null);
  const [calcQty, setCalcQty] = useState<number>(0);

  const addSupplyMut = trpc.partner.createPartnerSupply.useMutation({
    onSuccess: () => {
      toast.success("Supply item added");
      setMaterialName("");
      setBrand("");
      setSpecType("");
      setSelectedCatalogId("");
      setExFactoryRate(0);
      setTransportRate(0);
      setNotes("");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteSupplyMut = trpc.partner.deletePartnerSupply.useMutation({
    onSuccess: () => {
      toast.success("Supply item deleted");
      if (calcItem && !partner.supplies.some((s: any) => s.id !== calcItem.id)) {
        setCalcItem(null);
      }
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  // Derived calculations for Calculator
  const calcMaterialCost = calcItem ? calcQty * calcItem.exFactoryRate : 0;
  const calcTransportCost = calcItem ? calcQty * calcItem.transportRate : 0;
  const calcDeliveredCost = calcMaterialCost + calcTransportCost;

  return (
    <div className="space-y-6">
      {/* Back button and Vendor header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1.5 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Back to Vendors
          </button>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600 shrink-0" />
            {partner.name}
            {partner.code && (
              <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded">
                {partner.code}
              </span>
            )}
          </h2>
        </div>
      </div>

      {/* General Metadata */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs bg-muted/20 p-4 rounded-xl border border-border/50">
        <div>
          <span className="text-muted-foreground block mb-0.5">Contact Person</span>
          <span className="font-medium text-foreground">{partner.contact || "—"}</span>
        </div>
        <div>
          <span className="text-muted-foreground block mb-0.5">Phone Number</span>
          <span className="font-medium text-foreground">{partner.phone || "—"}</span>
        </div>
        <div>
          <span className="text-muted-foreground block mb-0.5">Email Address</span>
          <span
            className="font-medium text-foreground truncate block max-w-full"
            title={partner.email}
          >
            {partner.email || "—"}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground block mb-0.5">Status</span>
          <Badge
            variant="secondary"
            className={cn(
              "capitalize text-[10px]",
              partner.status === "active"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-slate-100 text-slate-600"
            )}
          >
            {partner.status}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground block mb-0.5">PAN Number</span>
          <span className="font-medium text-foreground">{partner.pan || "—"}</span>
        </div>
        <div>
          <span className="text-muted-foreground block mb-0.5">Registration Number</span>
          <span className="font-medium text-foreground">{partner.regNumber || "—"}</span>
        </div>
        <div className="col-span-2">
          <span className="text-muted-foreground block mb-0.5">Office Address</span>
          <span className="font-medium text-foreground">{partner.address || "—"}</span>
        </div>
        {partner.notes && (
          <div className="col-span-2 md:col-span-4 border-t pt-2 mt-1 italic text-muted-foreground">
            Notes: &quot;{partner.notes}&quot;
          </div>
        )}
      </div>

      {/* Main split-screen grid */}
      {partner.type === "material_supplier" || partner.type === "both" ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          {/* Left Side: Available Materials Table */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                📦 Available Materials
              </h3>
              <span className="text-xs text-muted-foreground">
                {partner.supplies?.length || 0} items listed
              </span>
            </div>

            <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30 text-muted-foreground text-left">
                      <th className="p-3 font-semibold">Material Name</th>
                      <th className="p-3 font-semibold">Unit</th>
                      <th className="p-3 font-semibold text-right">Ex-Factory Rate</th>
                      <th className="p-3 font-semibold text-right">Transport Rate</th>
                      <th className="p-3 font-semibold text-center w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!partner.supplies || partner.supplies.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                          No materials listed in supply catalog yet. Use the form on the right to add
                          items.
                        </td>
                      </tr>
                    ) : (
                      partner.supplies.map((s: any) => (
                        <tr
                          key={s.id}
                          onClick={() => {
                            setCalcItem(s);
                            setCalcQty(0);
                          }}
                          className={cn(
                            "border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer",
                            calcItem?.id === s.id && "bg-blue-50/20 dark:bg-blue-950/10"
                          )}
                        >
                          <td className="p-3 font-semibold text-foreground">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "w-2 h-2 rounded-full shrink-0",
                                  calcItem?.id === s.id ? "bg-blue-500" : "bg-transparent"
                                )}
                              />
                              <div>
                                <span className="text-foreground font-bold">
                                  {s.brand ? `${s.brand} ` : ""}
                                  {s.materialName}
                                </span>
                                {s.specType && (
                                  <Badge
                                    variant="outline"
                                    className="ml-2 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 border-blue-200 text-[9px] py-0 px-1.5 font-mono"
                                  >
                                    {s.specType}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground">{s.unit}</td>
                          <td className="p-3 text-right font-medium text-emerald-600">
                            NPR {s.exFactoryRate.toLocaleString()}
                          </td>
                          <td className="p-3 text-right text-muted-foreground">
                            NPR {s.transportRate.toLocaleString()}
                          </td>
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            {canWrite ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                disabled={deleteSupplyMut.isPending}
                                onClick={() => {
                                  if (confirm("Remove this supply rate?")) {
                                    deleteSupplyMut.mutate({ supplyId: s.id });
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Side: Add Material Form & Cost Calculator */}
          <div className="lg:col-span-2 space-y-6">
            {/* Add Material Form */}
            {canWrite && (
              <Card className="border border-border/50 shadow-sm">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5 text-blue-500" /> Add Material Rate
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    Link to catalog and enter supplier brand & specification.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {/* Master Catalog Selector (Primary) */}
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold text-foreground">
                      Select Item from Catalog *
                    </Label>
                    <select
                      value={selectedCatalogId}
                      onChange={(e) => {
                        const selId = e.target.value;
                        if (selId === "custom") {
                          setSelectedCatalogId("custom");
                          setMaterialName("");
                          setUnit("unit");
                          return;
                        }
                        const m = materialsData?.materials.find((mat) => mat.id === selId);
                        if (m) {
                          setSelectedCatalogId(m.materialCatalogId || m.id);
                          setMaterialName(m.name);
                          setUnit(m.unit);
                          if (m.subCategory) setSpecType(m.subCategory);
                        }
                      }}
                      className="flex h-8 w-full rounded border border-input bg-background px-2.5 text-xs shadow-2xs font-medium"
                    >
                      <option value="" disabled>
                        -- Select Catalog Item --
                      </option>
                      {materialsData?.materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.unit}) {m.subCategory ? `— ${m.subCategory}` : ""}
                        </option>
                      ))}
                      <option value="custom">✏️ + Custom Material (Not in Catalog)</option>
                    </select>
                  </div>

                  {/* Selected Item Badge / Auto-filled indicator */}
                  {selectedCatalogId && selectedCatalogId !== "custom" && (
                    <div className="bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-2 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-semibold text-blue-900 dark:text-blue-200">
                          {materialName}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-2">
                          Unit: <strong>{unit}</strong>
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[9px] bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-blue-300"
                      >
                        Catalog Linked
                      </Badge>
                    </div>
                  )}

                  {/* Custom Name & Unit Inputs (Only shown if Custom is selected) */}
                  {selectedCatalogId === "custom" && (
                    <div className="grid grid-cols-2 gap-3 bg-muted/20 p-2.5 rounded-lg border">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Custom Material Name *</Label>
                        <Input
                          value={materialName}
                          onChange={(e) => setMaterialName(e.target.value)}
                          placeholder="e.g. Special Sealant"
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Unit *</Label>
                        <Input
                          value={unit}
                          onChange={(e) => setUnit(e.target.value)}
                          placeholder="e.g. tube / set"
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                    </div>
                  )}

                  {/* Brand & Specification */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Brand / Manufacturer</Label>
                      <Input
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                        placeholder="e.g. Shivam / Kirloskar"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Grade / Capacity / Spec</Label>
                      <Input
                        value={specType}
                        onChange={(e) => setSpecType(e.target.value)}
                        placeholder="e.g. 53 Grade / 400 KVA"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Ex-Factory Rate (NPR)</Label>
                      <Input
                        type="number"
                        value={exFactoryRate || ""}
                        onChange={(e) => setExFactoryRate(Number(e.target.value))}
                        placeholder="e.g. 900"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Transport Rate (NPR)</Label>
                      <Input
                        type="number"
                        value={transportRate || ""}
                        onChange={(e) => setTransportRate(Number(e.target.value))}
                        placeholder="e.g. 50"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs mt-1"
                    disabled={addSupplyMut.isPending || !materialName || !unit}
                    onClick={() =>
                      addSupplyMut.mutate({
                        partnerId: partner.id,
                        materialCatalogId: selectedCatalogId || undefined,
                        materialName,
                        brand: brand.trim() || undefined,
                        specType: specType.trim() || undefined,
                        unit,
                        exFactoryRate,
                        transportRate,
                        notes: notes || null,
                      })
                    }
                  >
                    {addSupplyMut.isPending ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5 mr-1" />
                    )}
                    Add Material Rate
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Delivered Cost Calculator */}
            <Card className="border-blue-200 bg-blue-50/20 dark:border-blue-950 dark:bg-blue-950/10 shadow-sm">
              <CardHeader className="pb-3 pt-4 px-4">
                <CardTitle className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5 uppercase">
                  <Calculator className="h-4 w-4" /> Delivered Cost Calculator
                </CardTitle>
                <CardDescription className="text-[10px]">
                  Quick budget estimator for this vendor&apos;s rates.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                {!calcItem ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                    <Info className="h-8 w-8 text-blue-300 dark:text-blue-500 mb-2" />
                    <p className="text-[10px]">
                      Select any material from the table to load its rates here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        {calcItem.materialName}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Ex-Factory: NPR {calcItem.exFactoryRate.toLocaleString()} / {calcItem.unit}{" "}
                        <br />
                        Transport: NPR {calcItem.transportRate.toLocaleString()} / {calcItem.unit}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold text-blue-900 dark:text-blue-200">
                        Order Quantity ({calcItem.unit})
                      </Label>
                      <Input
                        type="number"
                        value={calcQty || ""}
                        onChange={(e) => setCalcQty(Number(e.target.value))}
                        placeholder={`e.g. 100 ${calcItem.unit}`}
                        className="h-8 text-xs bg-background"
                      />
                    </div>

                    <div className="space-y-2 border-t pt-3 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Ex-Factory Subtotal:</span>
                        <span className="font-semibold text-foreground">
                          NPR {calcMaterialCost.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Transport Subtotal:</span>
                        <span className="font-semibold text-foreground text-amber-600">
                          NPR {calcTransportCost.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-2 text-sm font-bold text-foreground">
                        <span>Delivered Total:</span>
                        <span className="text-emerald-600">
                          NPR {calcDeliveredCost.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic text-center py-6 bg-muted/10 rounded-xl border">
          Equipment vendor rental rates are managed in the Equipment Rental contracts.
        </p>
      )}
    </div>
  );
}
