"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CalendarDays, Info } from "lucide-react";

type HolidayRow = {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  type: string; // public | festival | optional
  createdAt: Date | string;
};

/** The compiled constant covers these years (fallback when the DB has none). */
const CONSTANT_COVERED_YEARS = [2025, 2026];

const TYPE_BADGE: Record<string, string> = {
  public: "bg-primary/10 text-primary border-primary/30",
  festival: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  optional: "bg-muted text-muted-foreground border-border",
};

function dayName(dateStr: string): string {
  // dateStr is YYYY-MM-DD; parse as UTC noon to dodge DST edge cases.
  const d = new Date(`${dateStr}T12:00:00Z`);
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return names[d.getUTCDay()] ?? "—";
}

export default function AdminHolidays() {
  const utils = trpc.useUtils();
  const nowYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(nowYear);

  const { data, isLoading } = trpc.admin.holidayList.useQuery({ year: selectedYear });
  const holidays: HolidayRow[] = useMemo(() => data?.holidays ?? [], [data]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDate, setEditDate] = useState<string | null>(null); // null = creating
  const [form, setForm] = useState({ date: "", name: "", type: "public" });
  const [deleteTarget, setDeleteTarget] = useState<HolidayRow | null>(null);

  const yearCoveredByDb = holidays.length > 0;
  const fallsBackToConstant = CONSTANT_COVERED_YEARS.includes(selectedYear);

  const upsertMut = trpc.admin.holidayUpsert.useMutation({
    onSuccess: (_res, vars) => {
      utils.admin.holidayList.invalidate();
      setDialogOpen(false);
      toast.success(editDate ? "Holiday updated" : "Holiday added", {
        description: `${vars.date} — scheduling picks this up immediately (calendar cache refreshed).`,
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.admin.holidayDelete.useMutation({
    onSuccess: (_res, vars) => {
      utils.admin.holidayList.invalidate();
      toast.success("Holiday removed", {
        description: `${vars.date} — the calendar cache was refreshed.`,
      });
    },
    onError: (e) => toast.error(e.message),
  });

  function openCreate() {
    setEditDate(null);
    setForm({ date: `${selectedYear}-01-01`, name: "", type: "public" });
    setDialogOpen(true);
  }

  function openEdit(h: HolidayRow) {
    setEditDate(h.date);
    setForm({ date: h.date, name: h.name, type: h.type });
    setDialogOpen(true);
  }

  function submit() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      toast.error("Pick a valid date");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Give the holiday a name");
      return;
    }
    upsertMut.mutate({ date: form.date, name: form.name.trim(), type: form.type as "public" | "festival" | "optional" });
  }

  // Year picker: the current ± 3 years window is plenty for planning horizons.
  const yearChoices = useMemo(() => {
    const years = new Set<number>([
      nowYear - 1,
      nowYear,
      nowYear + 1,
      nowYear + 2,
      ...CONSTANT_COVERED_YEARS,
    ]);
    return [...years].sort((a, b) => b - a);
  }, [nowYear]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Holiday Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Nepal public holidays driving the working-day calendar (CPM scheduling, EVM, leveling).
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Add Holiday
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> {selectedYear} holidays
          </CardTitle>
          <CardDescription className="text-xs">
            {yearCoveredByDb
              ? `DB rows are AUTHORITATIVE for ${selectedYear}: ${holidays.length} holiday${holidays.length === 1 ? "" : "s"} replace the compiled constant for this year.`
              : fallsBackToConstant
                ? `No DB rows for ${selectedYear} — the compiled constant applies (approximate lunar-calendar dates). Adding any holiday for this year makes DB rows authoritative.`
                : `No DB rows for ${selectedYear} and the compiled constant does not cover it — every day except Saturday counts as a working day. Maintain ${selectedYear} to plan through festivals.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearChoices.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <Info className="inline h-3 w-3 mr-1" />
              Editing takes effect within 5 minutes on other server instances.
            </p>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center border rounded-md">
              No holidays configured for {selectedYear}.
            </p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-mono text-xs">{h.date}</TableCell>
                      <TableCell className="text-muted-foreground">{dayName(h.date)}</TableCell>
                      <TableCell>{h.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={TYPE_BADGE[h.type] ?? TYPE_BADGE.public}>
                          {h.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(h)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(h)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">How this calendar is used</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>
            • <strong>Saturdays are always non-working</strong> — weekend logic is not overridable here.
          </p>
          <p>
            • CPM forward/backward passes, resource leveling, and EVM planned-value accrual all skip
            these dates; a task scheduled across a 5-day Dashain block does not burn duration.
          </p>
          <p>
            • Per-year authority: once the DB has <em>any</em> rows for a year, those rows fully
            replace the compiled constant for that year — wrong constant dates can be corrected by
            adding the right date and deleting the wrong one.
          </p>
          <p>
            • The compiled constant covers {CONSTANT_COVERED_YEARS.join("–")} only;{" "}
            {nowYear + 1}+ must be maintained here.
          </p>
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editDate ? `Edit holiday (${editDate})` : "Add holiday"}</DialogTitle>
            <DialogDescription>
              Upserts on the date — saving over an existing date updates its name and type.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="holiday-date">Date</Label>
              <Input
                id="holiday-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                disabled={!!editDate}
              />
              {editDate && (
                <p className="text-xs text-muted-foreground">
                  The date is the key — delete and re-add to move a holiday.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="holiday-name">Name</Label>
              <Input
                id="holiday-name"
                placeholder="e.g. Vijaya Dashami"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="festival">Festival</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={upsertMut.isPending}>
              {upsertMut.isPending ? "Saving…" : editDate ? "Save changes" : "Add holiday"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.date} becomes a regular working day (unless it is a Saturday). This
              cannot be undone, but the holiday can be re-added.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteMut.mutate({ date: deleteTarget.date });
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
