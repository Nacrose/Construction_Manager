"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, MapPin } from "lucide-react";
import { format } from "date-fns";

type Props = { projectId: string };

export function PhotoTimeline({ projectId }: Props) {
  const { data, isLoading } = trpc.dashboard.photoTimeline.useQuery({ projectId, limit: 50 });

  if (isLoading) return <Card><CardContent><Skeleton className="h-48" /></CardContent></Card>;
  if (!data || data.total === 0) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Camera className="h-4 w-4" /> Photographic Timeline</CardTitle></CardHeader>
        <CardContent><div className="text-center py-6 text-xs text-muted-foreground"><Camera className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>No photos uploaded yet.</p><p className="mt-1">Attach photos to daily reports to build the timeline.</p></div></CardContent>
      </Card>
    );
  }

  const dates = Object.entries(data.byDate).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><Camera className="h-4 w-4" /> Photographic Timeline</CardTitle>
        <CardDescription className="text-xs">
          {data.total} photos across {dates.length} days · {data.withGeo} with GPS
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {dates.map(([date, photos]) => (
            <div key={date}>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 sticky top-0 bg-card">
                {format(new Date(date), "EEEE, dd MMM yyyy")} · {photos.length} photo{photos.length > 1 ? "s" : ""}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {photos.map(photo => (
                  <div key={photo.id} className="aspect-square rounded border bg-muted flex flex-col items-center justify-center p-1 hover:shadow-sm transition-shadow">
                    <Camera className="h-4 w-4 text-muted-foreground mb-0.5" />
                    <div className="text-[7px] text-center truncate w-full">{photo.fileName}</div>
                    <div className="text-[7px] text-muted-foreground">{photo.reportNumber}</div>
                    {photo.latitude != null && (
                      <MapPin className="h-2 w-2 text-info mt-0.5" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground italic mt-2 text-center">
          Photo thumbnails are placeholders — full images are in each daily report's attachment section.
        </p>
      </CardContent>
    </Card>
  );
}
