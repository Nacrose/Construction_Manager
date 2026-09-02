"use client";

import { use, useState, useMemo } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Image as ImageIcon,
  ArrowLeftRight,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedPage } from "@/components/ui/animated-page";
import { MatrixPanel } from "@/components/matrix/matrix-panel";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay } from "date-fns";

type PhotoMessage = {
  id: string;
  text: string;
  attachmentData?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  createdAt: Date | string;
  user?: { id: string; name: string } | null;
};

type ReportWithPhotos = {
  reportId: string;
  reportDate: Date | string;
  reportNumber: string;
  photos: PhotoMessage[];
};

export default function PhotoProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [lightboxPhoto, setLightboxPhoto] = useState<PhotoMessage | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data: reportsData, isLoading: reportsLoading } = trpc.workflow.dailyReport.listReports.useQuery({ projectId: id });

  const reports = reportsData?.reports ?? [];

  const weekDays = useMemo(() => {
    const end = endOfWeek(weekStart, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end });
  }, [weekStart]);

  const reportsWithPhotos = useMemo(() => {
    const result: ReportWithPhotos[] = [];
    for (const report of reports) {
      const reportDate = new Date(report.reportDate);
      const inWeek = weekDays.some((d) => isSameDay(d, reportDate));
      if (!inWeek) continue;
      result.push({
        reportId: report.id,
        reportDate: report.reportDate,
        reportNumber: report.number,
        photos: [],
      });
    }
    return result;
  }, [reports, weekDays]);

  const { data: photosData, isLoading: photosLoading } = trpc.chat.listChannels.useQuery({ projectId: id });

  const selectedDateObjects = useMemo(() => {
    return selectedDates.map((d) => {
      const [year, month, day] = d.split("-").map(Number);
      return new Date(year, month - 1, day);
    });
  }, [selectedDates]);

  function toggleDateSelection(dateStr: string) {
    setSelectedDates((prev) => {
      if (prev.includes(dateStr)) return prev.filter((d) => d !== dateStr);
      if (prev.length >= 2) return [prev[1], dateStr];
      return [...prev, dateStr];
    });
  }

  function handlePrevWeek() {
    setWeekStart((d) => subWeeks(d, 1));
  }

  function handleNextWeek() {
    setWeekStart((d) => addWeeks(d, 1));
  }

  function handleThisWeek() {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  }

  return (
    <AnimatedPage className="space-y-3 pb-8 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={`/projects/${id}/drawings`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border/80 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Back to drawings"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-1.5 text-xs min-w-0">
            <Link href={`/projects/${id}`} className="text-muted-foreground hover:text-foreground truncate">
              {projectInfo?.project.code ?? "Project"}
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-bold text-primary uppercase tracking-wider">Photo Progress</span>
          </div>
        </div>
        <Button
          variant={compareMode ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs font-mono border-border/80"
          onClick={() => {
            setCompareMode(!compareMode);
            setSelectedDates([]);
          }}
        >
          <ArrowLeftRight className="h-3.5 w-3.5 mr-1" />
          {compareMode ? "Exit Compare" : "Compare Dates"}
        </Button>
      </div>

      {/* Week Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/80 bg-card p-2">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-border/80" onClick={handlePrevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs font-mono border-border/80 px-2.5 font-bold" onClick={handleThisWeek}>
            This Week
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-border/80" onClick={handleNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground ml-2">
            {format(weekStart, "dd MMM")} — {format(endOfWeek(weekStart, { weekStartsOn: 1 }), "dd MMM yyyy")}
          </span>
        </div>
        {compareMode && selectedDates.length === 2 && (
          <Badge variant="default" className="text-[10px]">
            Comparing {format(selectedDates[0] ? new Date(selectedDates[0]) : new Date(), "dd MMM")} vs {format(selectedDates[1] ? new Date(selectedDates[1]) : new Date(), "dd MMM")}
          </Badge>
        )}
      </div>

      {/* Photo Timeline */}
      {reportsLoading || photosLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : reportsWithPhotos.length === 0 ? (
        <div className="rounded border border-border/80 bg-card p-12 text-center flex flex-col items-center gap-3">
          <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-bold text-sm">No photos for this week</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Photos are attached to daily reports via the chat system.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {weekDays.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayReport = reportsWithPhotos.find((r) =>
              isSameDay(new Date(r.reportDate), day)
            );
            const isSelected = selectedDates.includes(dateStr);
            const isToday = isSameDay(day, new Date());

            return (
              <Card
                key={dateStr}
                className={cn(
                  "transition-all",
                  isSelected && "border-primary shadow-[0_0_12px_rgba(245,158,11,0.2)]",
                  compareMode && "cursor-pointer hover:border-primary/60"
                )}
                onClick={() => compareMode && toggleDateSelection(dateStr)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs flex items-center gap-2">
                      <CalendarIcon className="h-3.5 w-3.5 text-primary" />
                      <span className={cn("font-bold", isToday && "text-primary")}>
                        {format(day, "EEEE, dd MMM yyyy")}
                      </span>
                      {isToday && (
                        <Badge variant="default" className="text-[9px]">Today</Badge>
                      )}
                      {dayReport && (
                        <Badge variant="secondary" className="text-[9px]">
                          {dayReport.reportNumber}
                        </Badge>
                      )}
                    </CardTitle>
                    {compareMode && (
                      <div className={cn(
                        "h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
                        isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                      )}>
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {dayReport && dayReport.photos.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                      {dayReport.photos.map((photo) => (
                        <button
                          key={photo.id}
                          className="relative group aspect-square rounded-md border overflow-hidden bg-muted/30 hover:border-primary/60 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightboxPhoto(photo);
                          }}
                        >
                          {photo.attachmentData && photo.attachmentType ? (
                            <img
                              src={`data:${photo.attachmentType};base64,${photo.attachmentData}`}
                              alt={photo.attachmentName ?? "Site photo"}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                            </div>
                          )}
                          <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">
                            {photo.user?.name} · {format(new Date(photo.createdAt), "HH:mm")}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No photos attached to reports for this day.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Lightbox Dialog */}
      <Dialog open={!!lightboxPhoto} onOpenChange={(o) => !o && setLightboxPhoto(null)}>
        <DialogContent className="sm:max-w-3xl p-0 overflow-hidden">
          {lightboxPhoto && (
            <div className="flex flex-col">
              <DialogHeader className="px-4 py-3 border-b border-border/60">
                <DialogTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-primary" />
                    {lightboxPhoto.attachmentName ?? "Site Photo"}
                  </span>
                  <span className="text-xs text-muted-foreground font-normal">
                    {lightboxPhoto.user?.name} · {format(new Date(lightboxPhoto.createdAt), "dd MMM yyyy HH:mm")}
                  </span>
                </DialogTitle>
              </DialogHeader>
              <div className="relative bg-black/90 flex items-center justify-center min-h-[400px]">
                {lightboxPhoto.attachmentData && lightboxPhoto.attachmentType ? (
                  <img
                    src={`data:${lightboxPhoto.attachmentType};base64,${lightboxPhoto.attachmentData}`}
                    alt={lightboxPhoto.attachmentName ?? "Site photo"}
                    className="max-h-[70vh] max-w-full object-contain"
                  />
                ) : (
                  <div className="text-muted-foreground text-sm">Image not available</div>
                )}
              </div>
              {lightboxPhoto.text && (
                <div className="px-4 py-3 border-t border-border/60">
                  <p className="text-xs text-muted-foreground">{lightboxPhoto.text}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  );
}
