"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AnimatedPage } from "@/components/ui/animated-page";
import {ArrowLeft, CheckCircle, Plus, Trash2} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function VariationOrderDetailsPage() {
  const params = useParams();
  const _router = useRouter();
  const projectId = params.id as string;
  const voId = params.voId as string;

  const [addOpen, setAddOpen] = useState(false);
  const [sourceType, setSourceType] = useState<"existing" | "new">("existing");
  const [selectedBoqId, setSelectedBoqId] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [customUnit, setCustomUnit] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newRate, setNewRate] = useState("");

  const { data: vo, isLoading, refetch } = trpc.variationOrder.get.useQuery({ id: voId, projectId });
  const { data: boqData } = trpc.boq.list.useQuery({ projectId });
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);

  const utils = trpc.useUtils();

  const updateMutation = trpc.variationOrder.update.useMutation({
    onSuccess: () => {
      toast.success("Variation Order saved");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const statusMutation = trpc.variationOrder.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Variation Order approved & Master BOQ updated");
      refetch();
      utils.variationOrder.list.invalidate({ projectId });
      utils.boq.list.invalidate({ projectId }); // refresh BOQ!
      setConfirmApproveOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !vo) return <div className="p-8 text-center animate-pulse">Loading Variation Order...</div>;

  const isEditable = vo.status !== "approved";

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditable) return;

    let boqItemId: string | null = null;
    let boqCode = customCode;
    let boqDesc = customDesc;
    let unit = customUnit;
    let previousQty = 0;
    let previousRate = 0;

    if (sourceType === "existing") {
      const b = boqData?.items.find((x) => x.id === selectedBoqId);
      if (!b) return toast.error("Select a valid BOQ item");
      boqItemId = b.id;
      boqCode = b.code;
      boqDesc = b.description;
      unit = b.unit;
      previousQty = b.quantity;
      previousRate = b.rate;
    }

    const nQty = parseFloat(newQty) || 0;
    const nRate = parseFloat(newRate) || 0;

    const currentItems = vo.items.map((i) => ({
      id: i.id,
      boqItemId: i.boqItemId,
      boqCode: i.boqCode,
      boqDesc: i.boqDesc,
      unit: i.unit,
      previousQty: i.previousQty,
      newQty: i.newQty,
      previousRate: i.previousRate,
      newRate: i.newRate,
    }));

    updateMutation.mutate({
      id: vo.id,
      projectId,
      title: vo.title,
      description: vo.description || undefined,
      items: [
        ...currentItems,
        {
          boqItemId,
          boqCode,
          boqDesc,
          unit,
          previousQty,
          previousRate,
          newQty: nQty,
          newRate: nRate,
        },
      ],
    });

    setAddOpen(false);
    setSelectedBoqId("");
    setCustomCode("");
    setCustomDesc("");
    setCustomUnit("");
    setNewQty("");
    setNewRate("");
  };

  const handleRemoveItem = (itemId: string) => {
    if (!isEditable) return;
    const filtered = vo.items
      .filter((i) => i.id !== itemId)
      .map((i) => ({
        id: i.id,
        boqItemId: i.boqItemId,
        boqCode: i.boqCode,
        boqDesc: i.boqDesc,
        unit: i.unit,
        previousQty: i.previousQty,
        newQty: i.newQty,
        previousRate: i.previousRate,
        newRate: i.newRate,
      }));

    updateMutation.mutate({
      id: vo.id,
      projectId,
      title: vo.title,
      description: vo.description || undefined,
      items: filtered,
    });
  };

  return (
    <AnimatedPage className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <Link href={`/projects/${projectId}/variations`} className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Variations
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{vo.number}</h1>
            <Badge
              variant={
                vo.status === "approved"
                  ? "default"
                  : vo.status === "submitted"
                  ? "secondary"
                  : vo.status === "rejected"
                  ? "destructive"
                  : "outline"
              }
              className="text-sm"
            >
              {vo.status.toUpperCase()}
            </Badge>
          </div>
          <p className="text-xl text-muted-foreground mt-1">{vo.title}</p>
          {vo.description && <p className="text-sm text-muted-foreground mt-2 max-w-3xl">{vo.description}</p>}
        </div>

        {isEditable && (
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setConfirmApproveOpen(true)}
              disabled={statusMutation.isPending || vo.items.length === 0}
            >
              <CheckCircle className="h-4 w-4" /> Approve & Merge to BOQ
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg">Variation Items</CardTitle>
          {isEditable && (
            <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 h-8">
              <Plus className="h-3.5 w-3.5" /> Add Item
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {vo.items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
              No items added to this variation yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-3 px-4 font-medium">Code</th>
                    <th className="py-3 px-4 font-medium">Description</th>
                    <th className="py-3 px-4 font-medium">Unit</th>
                    <th className="py-3 px-4 font-medium text-right">Prev Qty</th>
                    <th className="py-3 px-4 font-medium text-right text-primary">New Qty</th>
                    <th className="py-3 px-4 font-medium text-right">Prev Rate</th>
                    <th className="py-3 px-4 font-medium text-right text-primary">New Rate</th>
                    <th className="py-3 px-4 font-medium text-right text-emerald-600">Delta Amount</th>
                    {isEditable && <th className="py-3 px-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {vo.items.map((item) => {
                    const prevAmount = item.previousQty * item.previousRate;
                    const newAmount = item.newQty * item.newRate;
                    const delta = newAmount - prevAmount;

                    return (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-3 px-4 font-mono">
                          {item.boqCode}
                          {!item.boqItemId && <Badge variant="secondary" className="ml-2 text-[10px]">EXTRA</Badge>}
                        </td>
                        <td className="py-3 px-4 max-w-[200px] truncate" title={item.boqDesc}>
                          {item.boqDesc}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{item.unit}</td>
                        <td className="py-3 px-4 text-right text-muted-foreground line-through">
                          {item.previousQty.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {item.newQty.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right text-muted-foreground line-through">
                          ${item.previousRate.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          ${item.newRate.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className={cn("py-3 px-4 text-right font-bold", delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : "")}>
                          {delta > 0 ? "+" : ""}${delta.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        {isEditable && (
                          <td className="py-3 px-4 text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleRemoveItem(item.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Item to Variation</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddItem} className="space-y-4 pt-2">
            <div className="flex items-center gap-4 border-b pb-4">
              <Label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sourceType"
                  checked={sourceType === "existing"}
                  onChange={() => setSourceType("existing")}
                />
                Modify Existing BOQ Item
              </Label>
              <Label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sourceType"
                  checked={sourceType === "new"}
                  onChange={() => setSourceType("new")}
                />
                New Extra Item
              </Label>
            </div>

            {sourceType === "existing" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Select BOQ Item</Label>
                  <Select value={selectedBoqId} onValueChange={(v) => {
                    setSelectedBoqId(v);
                    const b = boqData?.items.find(x => x.id === v);
                    if (b) {
                      setNewQty(b.quantity.toString());
                      setNewRate(b.rate.toString());
                    }
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Search BOQ items..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {boqData?.items.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.code} - {b.description} ({b.quantity} {b.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>New BOQ Code *</Label>
                    <Input required value={customCode} onChange={(e) => setCustomCode(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit *</Label>
                    <Input required value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description *</Label>
                  <Textarea required value={customDesc} onChange={(e) => setCustomDesc(e.target.value)} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label>Revised Quantity *</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                />
                {sourceType === "existing" && selectedBoqId && (
                  <p className="text-xs text-muted-foreground">
                    Current: {boqData?.items.find(x => x.id === selectedBoqId)?.quantity}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Revised Rate *</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                />
                {sourceType === "existing" && selectedBoqId && (
                  <p className="text-xs text-muted-foreground">
                    Current: ${boqData?.items.find(x => x.id === selectedBoqId)?.rate}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={updateMutation.isPending}>Add Item</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal for Approving VO */}
      <ConfirmDialog
        open={confirmApproveOpen}
        onOpenChange={setConfirmApproveOpen}
        title="Approve Variation Order & Merge to BOQ?"
        description="Approving this Variation Order will permanently alter the project's Master BOQ quantities and rates. This action updates contract baseline calculations."
        variant="warning"
        confirmLabel="Approve & Merge"
        isLoading={statusMutation.isPending}
        onConfirm={async () => {
          await statusMutation.mutateAsync({ id: vo.id, projectId, status: "approved" });
        }}
      />
    </AnimatedPage>
  );
}
