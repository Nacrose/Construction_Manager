"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  Building2,
  Plus,
  ArrowRightLeft,
  Package,
  MapPin,
  Phone,
  User,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
  ArrowRight
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";

interface StoreLocationsTabProps {
  projectId: string;
}

export function StoreLocationsTab({ projectId }: StoreLocationsTabProps) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.storeLocation.list.useQuery({ projectId });
  const { data: materialsData } = trpc.material.list.useQuery({ projectId });

  const [addStoreOpen, setAddStoreOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  // New store form state
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [incharge, setIncharge] = useState("");
  const [phone, setPhone] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  // Transfer form state
  const [transferMaterialId, setTransferMaterialId] = useState("");
  const [fromStoreId, setFromStoreId] = useState("");
  const [toStoreId, setToStoreId] = useState("");
  const [transferQty, setTransferQty] = useState<number | "">("");
  const [transferRemarks, setTransferRemarks] = useState("");

  const createStoreMutation = trpc.storeLocation.create.useMutation({
    onSuccess: () => {
      toast.success("Site store created successfully");
      utils.storeLocation.list.invalidate({ projectId });
      setAddStoreOpen(false);
      setName("");
      setCode("");
      setAddress("");
      setIncharge("");
      setPhone("");
      setIsDefault(false);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create store");
    },
  });

  const transferMutation = trpc.storeLocation.transferStock.useMutation({
    onSuccess: () => {
      toast.success("Stock transferred successfully");
      utils.storeLocation.list.invalidate({ projectId });
      utils.material.list.invalidate({ projectId });
      utils.material.listTransactions.invalidate({ projectId });
      setTransferOpen(false);
      setTransferMaterialId("");
      setFromStoreId("");
      setToStoreId("");
      setTransferQty("");
      setTransferRemarks("");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to transfer stock");
    },
  });

  const locations = data?.locations || [];
  const materials = materialsData?.materials || [];

  const handleCreateStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Store name is required");
      return;
    }
    createStoreMutation.mutate({
      projectId,
      name: name.trim(),
      code: code.trim() || null,
      address: address.trim() || null,
      incharge: incharge.trim() || null,
      phone: phone.trim() || null,
      isDefault,
    });
  };

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferMaterialId || !fromStoreId || !toStoreId || !transferQty || Number(transferQty) <= 0) {
      toast.error("Please fill in all required transfer fields");
      return;
    }
    if (fromStoreId === toStoreId) {
      toast.error("Source and destination stores must be different");
      return;
    }
    transferMutation.mutate({
      projectId,
      materialId: transferMaterialId,
      fromStoreId,
      toStoreId,
      quantity: Number(transferQty),
      remarks: transferRemarks || null,
    });
  };

  // Find stock in source store for the selected material
  const selectedSourceStore = locations.find((l) => l.id === fromStoreId);
  const selectedMaterialStock = selectedSourceStore?.stocks.find((s) => s.material.id === transferMaterialId);
  const selectedMaterialObj = materials.find((m) => m.id === transferMaterialId);

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <span>Site Store Locations & Sub-Stores</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            Manage distributed inventory across site camps, batching plants, crusher yards, and main stores
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTransferOpen(true)}
            className="gap-1.5 h-9 text-xs"
          >
            <ArrowRightLeft className="h-4 w-4 text-indigo-500" />
            Inter-Store Transfer
          </Button>

          <Button
            size="sm"
            onClick={() => setAddStoreOpen(true)}
            className="gap-1.5 h-9 text-xs shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Store Location
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading store locations...</span>
        </div>
      ) : locations.length === 0 ? (
        <Card className="text-center p-8">
          <CardContent className="space-y-3">
            <Building2 className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">No store locations set up yet</p>
            <Button size="sm" onClick={() => setAddStoreOpen(true)}>Create Main Site Store</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map((loc) => {
            const totalStockItems = loc.stocks.filter((s) => s.currentStock > 0).length;

            return (
              <Card key={loc.id} className="relative overflow-hidden border border-border/80 shadow-sm flex flex-col justify-between">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold">{loc.name}</CardTitle>
                        {loc.isDefault && (
                          <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary py-0 px-1.5 h-4 font-mono">
                            Default
                          </Badge>
                        )}
                      </div>
                      {loc.code && <p className="text-xs font-mono text-muted-foreground mt-0.5">{loc.code}</p>}
                    </div>

                    <Badge variant="outline" className="text-[11px] font-mono">
                      {totalStockItems} items in stock
                    </Badge>
                  </div>

                  <CardDescription className="text-xs space-y-1 pt-2">
                    {loc.address && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{loc.address}</span>
                      </div>
                    )}
                    {loc.incharge && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span>Incharge: {loc.incharge}</span>
                        {loc.phone && <span>({loc.phone})</span>}
                      </div>
                    )}
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-4 pt-2">
                  <div className="border-t pt-3 space-y-2">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                      Current Stock Breakdown:
                    </span>

                    {loc.stocks.length === 0 || loc.stocks.every((s) => s.currentStock === 0) ? (
                      <p className="text-xs text-muted-foreground italic py-1">No stock currently stored</p>
                    ) : (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {loc.stocks
                          .filter((s) => s.currentStock !== 0)
                          .map((s) => (
                            <div key={s.id} className="flex justify-between items-center text-xs py-1 border-b border-border/40 last:border-none">
                              <div>
                                <span className="font-medium text-foreground">{s.material.name}</span>
                                {s.material.subCategory && (
                                  <span className="text-[10px] text-muted-foreground ml-1">({s.material.subCategory})</span>
                                )}
                              </div>
                              <span className="font-mono font-semibold text-foreground">
                                {s.currentStock.toLocaleString()} {s.material.unit}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Store Dialog */}
      <Dialog open={addStoreOpen} onOpenChange={setAddStoreOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Site Store Location</DialogTitle>
            <DialogDescription>
              Define a new storage yard, batching plant, or site camp for material storage.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateStore} className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-semibold">Store Name *</Label>
              <Input
                placeholder="e.g. Batching Plant Store, Camp 1 Yard"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Store Code</Label>
                <Input
                  placeholder="e.g. ST-BP, ST-CAMP1"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="mt-1 text-sm font-mono"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Store Incharge</Label>
                <Input
                  placeholder="Name of storekeeper"
                  value={incharge}
                  onChange={(e) => setIncharge(e.target.value)}
                  className="mt-1 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Contact Phone</Label>
                <Input
                  placeholder="Phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 text-sm"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Address / Chainage</Label>
                <Input
                  placeholder="e.g. Ch 12+500"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-1 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="isDefault" className="text-xs cursor-pointer">
                Set as default receiving store for this project
              </Label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddStoreOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createStoreMutation.isPending}>
                {createStoreMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Create Store
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Inter-Store Transfer Dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
              <span>Inter-Store Stock Transfer</span>
            </DialogTitle>
            <DialogDescription>
              Transfer material stock from one site store to another.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleTransfer} className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-semibold">Material to Transfer *</Label>
              <Select value={transferMaterialId} onValueChange={setTransferMaterialId}>
                <SelectTrigger className="mt-1 text-sm">
                  <SelectValue placeholder="Select material" />
                </SelectTrigger>
                <SelectContent>
                  {materials.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} {m.subCategory ? `(${m.subCategory})` : ""} - Stock: {m.currentStock} {m.unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Source Store (From) *</Label>
                <Select value={fromStoreId} onValueChange={setFromStoreId}>
                  <SelectTrigger className="mt-1 text-sm">
                    <SelectValue placeholder="Select source store" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name} {loc.code ? `(${loc.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedMaterialStock && (
                  <p className="text-[11px] text-success dark:text-success/80 mt-1 font-mono">
                    Available: {selectedMaterialStock.currentStock} {selectedMaterialStock.material.unit}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold">Destination Store (To) *</Label>
                <Select value={toStoreId} onValueChange={setToStoreId}>
                  <SelectTrigger className="mt-1 text-sm">
                    <SelectValue placeholder="Select destination store" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations
                      .filter((loc) => loc.id !== fromStoreId)
                      .map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name} {loc.code ? `(${loc.code})` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Transfer Quantity *</Label>
              <div className="relative mt-1">
                <Input
                  type="number"
                  placeholder="Quantity to transfer"
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value === "" ? "" : Number(e.target.value))}
                  required
                  min="0.0001"
                  step="any"
                  className="pr-16 text-sm font-mono"
                />
                <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-mono">
                  {selectedMaterialObj?.unit || "units"}
                </span>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Remarks / Gate Transfer Slip No.</Label>
              <Input
                placeholder="e.g. Dispatched via Tipper BA-2-KHA-4512"
                value={transferRemarks}
                onChange={(e) => setTransferRemarks(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={transferMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {transferMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Confirm Transfer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
