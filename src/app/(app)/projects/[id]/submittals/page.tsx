"use client";

import { use, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Plus, FileCheck } from "lucide-react";
import { format } from "date-fns";
import { ModuleTabs } from "@/components/module-tabs";
import { CreateSubmittalDialog } from "./dialogs/create-submittal-dialog";
import { ReviewDialog } from "./dialogs/review-dialog";
import { SubmitButton } from "./components/submit-button";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";
import { StatusBadge } from "@/components/ui/status-badge";


const TYPE_LABELS: Record<string, string> = {
  shop_drawing: "Shop Drawing",
  material_sample: "Material Sample",
  product_data: "Product Data",
  technical_spec: "Technical Spec",
  other: "Other",
};

type SubmittalItem = {
  id: string;
  number: string;
  title: string;
  type: string;
  status: string;
  submittedDate?: Date | string | null;
  reviewedDate?: Date | string | null;
};

export default function SubmittalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);
  const [reviewItem, setReviewItem] = useState<{ id: string; number: string; title: string } | null>(null);

  const { data, isLoading } = trpc.submittal.list.useQuery({
    projectId: id,
  });
  const { data: stats } = trpc.submittal.stats.useQuery({ projectId: id });
  const submittals = (data?.submittals ?? []) as SubmittalItem[];

  const columns: ConstructionTableColumn<SubmittalItem>[] = useMemo(
    () => [
      {
        key: "number",
        header: "Submittal #",
        width: "130px",
        sortable: true,
        render: (val) => <span className="font-mono font-bold text-primary">{val}</span>,
      },
      {
        key: "title",
        header: "Submittal Title",
        sortable: true,
        render: (val) => <span className="font-medium text-foreground text-xs">{val}</span>,
      },
      {
        key: "type",
        header: "Type",
        width: "150px",
        render: (val) => (
          <span className="text-muted-foreground font-mono text-xs">
            {TYPE_LABELS[String(val)] ?? val}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        width: "140px",
        render: (val) => <StatusBadge status={val} />,
      },
      {
        key: "submittedDate",
        header: "Submitted",
        width: "120px",
        render: (val) => (
          <span className="text-muted-foreground font-mono text-xs">
            {val ? format(new Date(val), "dd MMM yyyy") : "—"}
          </span>
        ),
      },
      {
        key: "reviewedDate",
        header: "Reviewed",
        width: "120px",
        render: (val) => (
          <span className="text-muted-foreground font-mono text-xs">
            {val ? format(new Date(val), "dd MMM yyyy") : "—"}
          </span>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        width: "120px",
        align: "right",
        render: (_, s) => (
          <div className="flex items-center justify-end gap-1 font-mono">
            {s.status === "draft" && <SubmitButton submittalId={s.id} projectId={id} />}
            {s.status === "submitted" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setReviewItem({ id: s.id, number: s.number, title: s.title })}
                className="h-6 text-[10px] font-mono border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
              >
                Review
              </Button>
            )}
          </div>
        ),
      },
    ],
    [id]
  );

  return (
    <>
      <ModuleTabs projectId={id} cluster="documents" />
      <div className="space-y-4 pb-8 font-sans">
        {/* KPI Stats */}
        {stats && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 font-mono">
            {[
              { label: "Total", value: stats.total, color: "text-slate-700" },
              { label: "Draft", value: stats.draft, color: "text-slate-500" },
              { label: "Submitted", value: stats.submitted, color: "text-amber-700" },
              { label: "Approved", value: stats.approved, color: "text-emerald-700" },
              { label: "Rejected", value: stats.rejected, color: "text-rose-700" },
              { label: "Revise", value: stats.revise, color: "text-orange-700" },
            ].map((s) => (
              <Card key={s.label} className="p-3 text-center bg-white border-[#c7d8e8] shadow-xs rounded-xl">
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-slate-500 uppercase">{s.label}</div>
              </Card>
            ))}
          </div>
        )}

        {/* Action Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[#c7d8e8] bg-[#e5eef7]">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-700">
            <FileCheck className="h-4 w-4 text-[#0284c7]" />
            <span className="font-bold">Technical Submittals &amp; Approvals Register</span>
          </div>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="amber-cta-btn h-8 px-3.5 text-xs font-bold text-white rounded-lg shadow-sm gap-1.5 shrink-0 font-mono">
                <Plus className="h-3.5 w-3.5" /> + New Submittal (नयाँ पेश्की)
              </Button>
            </DialogTrigger>
            <CreateSubmittalDialog
              projectId={id}
              onDone={() => {
                setAddOpen(false);
                utils.submittal.list.invalidate({ projectId: id });
                utils.submittal.stats.invalidate({ projectId: id });
              }}
            />
          </Dialog>
        </div>

        {/* ConstructionTable Integration */}
        <ConstructionTable<SubmittalItem>
          data={submittals}
          columns={columns}
          isLoading={isLoading}
          searchPlaceholder="Search submittal number, title, type..."
          searchFilterKeys={["number", "title", "type", "status"]}
          exportExcel={{
            filename: `Submittals_Register_${format(new Date(), "yyyy-MM-dd")}`,
            sheetName: "Submittals",
          }}
          emptyState={{
            title: "No Technical Submittals",
            description: "Submit shop drawings, material samples, and product specifications for approval.",
          }}
        />

        {reviewItem && (
          <ReviewDialog
            projectId={id}
            item={reviewItem}
            onClose={() => setReviewItem(null)}
            onDone={() => {
              setReviewItem(null);
              utils.submittal.list.invalidate({ projectId: id });
              utils.submittal.stats.invalidate({ projectId: id });
            }}
          />
        )}
      </div>
    </>
  );
}
