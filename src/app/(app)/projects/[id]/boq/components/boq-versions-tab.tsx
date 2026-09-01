"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Check, X, Loader2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

export function BoqVersionsTab({
  projectId,
  canWrite = false,
}: {
  projectId: string;
  canWrite?: boolean;
}) {
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [diffVersion, setDiffVersion] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [notes, setNotes] = useState("");

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.boqVersion.list.useQuery({ projectId });

  const { data: versionDetail } = trpc.boqVersion.get.useQuery(
    { projectId, versionId: selectedVersion! },
    { enabled: !!selectedVersion }
  );

  const { data: diffData } = trpc.boqVersion.diff.useQuery(
    {
      projectId,
      versionId: selectedVersion!,
      vsVersionId: diffVersion ?? undefined,
    },
    { enabled: !!selectedVersion }
  );


  const createVersion = trpc.boqVersion.create.useMutation({
    onSuccess: (res) => {
      utils.boqVersion.list.invalidate({ projectId });
      setShowCreate(false);
      setNotes("");
      setSelectedVersion(res.version.id);
      toast.success(`Created BOQ snapshot V${res.version.versionNumber}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const approveVersion = trpc.boqVersion.approve.useMutation({
    onSuccess: () => {
      utils.boqVersion.list.invalidate({ projectId });
      utils.boqVersion.get.invalidate({ projectId, versionId: selectedVersion! });
      toast.success("Version approved");
    },
    onError: (e) => toast.error(e.message),
  });

  const versionColumns: ConstructionTableColumn<any>[] = [
    {
      key: "code",
      header: "Code",
      render: (_, item) => <span className="font-mono text-xs font-bold text-primary">{item.code}</span>,
    },
    {
      key: "description",
      header: "Description",
      render: (_, item) => (
        <span className="font-mono text-xs text-foreground truncate max-w-xs block">{item.description}</span>
      ),
    },
    {
      key: "unit",
      header: "Unit",
      render: (_, item) => <span className="text-muted-foreground font-mono text-xs">{item.unit}</span>,
    },
    {
      key: "quantity",
      header: "Qty",
      align: "right",
      render: (_, item) => <span className="font-mono text-xs font-medium text-foreground">{item.quantity}</span>,
    },
    {
      key: "rate",
      header: "Rate",
      align: "right",
      render: (_, item) => <span className="font-mono text-xs font-medium text-foreground">{formatNpr(item.rate)}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (_, item) => (
        <span className="font-mono text-xs font-bold text-foreground">{formatNpr(item.amount)}</span>
      ),
    },
    ...(versionDetail?.status === "draft"
      ? [
          {
            key: "diff",
            header: "Diff (vs V1)",
            align: "right" as const,
            render: (_: any, item: any) =>
              item.baselineQty !== null && item.baselineRate !== null ? (
                <div className="font-mono text-xs">
                  {item.quantity !== item.baselineQty && (
                    <span className={item.quantity > item.baselineQty ? "text-emerald-500 font-bold" : "text-red-500 font-bold"}>
                      qty: {item.quantity > item.baselineQty ? "+" : ""}{(item.quantity - item.baselineQty).toFixed(3)}
                    </span>
                  )}
                  {item.rate !== item.baselineRate && (
                    <span className={`ml-2 font-bold ${item.rate > item.baselineRate ? "text-emerald-500" : "text-red-500"}`}>
                      rate: {item.rate > item.baselineRate ? "+" : ""}{formatNpr(item.rate - item.baselineRate)}
                    </span>
                  )}
                  {item.quantity === item.baselineQty && item.rate === item.baselineRate && (
                    <span className="text-muted-foreground italic text-[10px]">unchanged</span>
                  )}
                </div>
              ) : null,
          },
        ]
      : []),
  ];

  const diffFilteredRows = diffData?.diffRows.filter(
    (r) => r.qtyDiff !== 0 || r.rateDiff !== 0 || r.amountDiff !== 0
  ) ?? [];

  const diffColumns: ConstructionTableColumn<any>[] = [
    {
      key: "code",
      header: "Code",
      render: (_, r) => <span className="font-mono text-xs font-bold text-primary">{r.code}</span>,
    },
    {
      key: "description",
      header: "Description",
      render: (_, r) => (
        <span className="font-mono text-xs text-foreground truncate max-w-[200px] block">{r.description}</span>
      ),
    },
    {
      key: "unit",
      header: "Unit",
      render: (_, r) => <span className="text-muted-foreground font-mono text-xs">{r.unit}</span>,
    },
    {
      key: "leftQty",
      header: `${diffData?.leftLabel ?? "Left"} Qty`,
      align: "right",
      render: (_, r) => <span className="font-mono text-xs">{r.leftQty.toFixed(3)}</span>,
    },
    {
      key: "rightQty",
      header: `${diffData?.rightLabel ?? "Right"} Qty`,
      align: "right",
      render: (_, r) => <span className="font-mono text-xs">{r.rightQty.toFixed(3)}</span>,
    },
    {
      key: "qtyDiff",
      header: "Qty \u0394",
      align: "right",
      render: (_, r) => (
        <span className={`font-mono text-xs ${r.qtyDiff > 0 ? "text-emerald-600 font-bold" : r.qtyDiff < 0 ? "text-red-600 font-bold" : ""}`}>
          {r.qtyDiff > 0 ? "+" : ""}{r.qtyDiff.toFixed(3) || "\u2014"}
        </span>
      ),
    },
    {
      key: "leftRate",
      header: `${diffData?.leftLabel ?? "Left"} Rate`,
      align: "right",
      render: (_, r) => <span className="font-mono text-xs">{formatNpr(r.leftRate)}</span>,
    },
    {
      key: "rightRate",
      header: `${diffData?.rightLabel ?? "Right"} Rate`,
      align: "right",
      render: (_, r) => <span className="font-mono text-xs">{formatNpr(r.rightRate)}</span>,
    },
    {
      key: "rateDiff",
      header: "Rate \u0394",
      align: "right",
      render: (_, r) => (
        <span className={`font-mono text-xs ${r.rateDiff > 0 ? "text-emerald-600 font-bold" : r.rateDiff < 0 ? "text-red-600 font-bold" : ""}`}>
          {r.rateDiff > 0 ? "+" : ""}{r.rateDiff ? formatNpr(r.rateDiff) : "\u2014"}
        </span>
      ),
    },
    {
      key: "amountDiff",
      header: "Amount \u0394",
      align: "right",
      render: (_, r) => (
        <span className={`font-mono text-xs font-bold ${r.amountDiff > 0 ? "text-emerald-600" : r.amountDiff < 0 ? "text-red-600" : ""}`}>
          {r.amountDiff > 0 ? "+" : ""}{r.amountDiff ? formatNpr(r.amountDiff) : "\u2014"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">BOQ Snapshots</h3>
          <p className="text-xs text-muted-foreground font-mono">
            Snapshots of the BOQ at different points in time. V1 = original contract. New versions are created when
            Variation Orders are processed or on demand.
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            {!showCreate ? (
              <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1 font-mono text-xs">
                <Plus className="h-3.5 w-3.5" /> Create Snapshot
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes for this version..."
                  className="h-8 w-56 rounded border bg-background px-2 text-xs font-mono"
                  onKeyDown={(e) => { if (e.key === "Enter") createVersion.mutate({ projectId, notes: notes || undefined }); }}
                />
                <Button size="sm" disabled={createVersion.isPending} onClick={() => createVersion.mutate({ projectId, notes: notes || undefined })}>
                  {createVersion.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setNotes(""); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-20" />
      ) : data && data.versions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {data.versions.map((v) => (
            <Button
              key={v.id}
              variant={selectedVersion === v.id ? "default" : "outline"}
              size="sm"
              onClick={() => { setSelectedVersion(v.id); setDiffVersion(null); }}
              className="gap-1 font-mono text-xs"
            >
              V{v.versionNumber}
              <Badge variant={v.status === "approved" ? "default" : "secondary"} className="text-[9px]">
                {v.status}
              </Badge>
              <span className="text-[10px] text-muted-foreground font-mono">({v._count.items})</span>
            </Button>
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground" />
          <p className="font-medium">No versions yet</p>
          <p className="text-xs text-muted-foreground font-mono">
            Create a snapshot to save the current state of the BOQ.
          </p>
        </Card>
      )}

      {versionDetail && (
        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between border-b pb-2 gap-2">
            <div className="text-sm font-semibold font-mono">
              V{versionDetail.versionNumber}
              <span className="ml-2 text-xs font-normal text-muted-foreground font-mono">
                {versionDetail.notes && `\u2014 ${versionDetail.notes}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {versionDetail.status === "draft" && canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 font-mono"
                  onClick={() => {
                    if (confirm("Approve this version?")) {
                      approveVersion.mutate({ projectId, versionId: versionDetail.id });
                    }
                  }}
                >
                  <Check className="mr-1 h-3 w-3" /> Approve
                </Button>
              )}
              <span className="text-[10px] text-muted-foreground font-mono">
                {new Date(versionDetail.createdAt).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>

          <ConstructionTable
            data={versionDetail.items}
            columns={versionColumns}
            isLoading={false}
            searchPlaceholder="Search version items..."
            searchFilterKeys={["code", "description"]}
          />

          {diffData && selectedVersion && (
            <div className="border-t pt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 bg-muted/40 p-2.5 rounded-lg text-xs font-mono">
                <span className="font-bold text-primary">Compare {diffData.leftLabel} vs {diffData.rightLabel}:</span>
                {data && data.versions.length > 1 && (
                  <select
                    value={diffVersion ?? ""}
                    onChange={(e) => setDiffVersion(e.target.value || null)}
                    className="h-7 rounded border bg-background px-2 text-xs font-mono"
                  >
                    <option value="">vs Current BOQ</option>
                    {data.versions.filter((v) => v.id !== selectedVersion).map((v) => (
                      <option key={v.id} value={v.id}>vs V{v.versionNumber}</option>
                    ))}
                  </select>
                )}
              </div>

              <ConstructionTable
                data={diffFilteredRows}
                columns={diffColumns}
                isLoading={false}
                searchPlaceholder="Search version diffs..."
                searchFilterKeys={["code", "description"]}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
