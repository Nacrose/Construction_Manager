"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, ImageIcon, X, Loader2, MapPin, Clock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type Attachment = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  data: string;
  storageUrl?: string;
  latitude: number | null;
  longitude: number | null;
  takenAt: Date | null;
  uploadedAt: Date;
  uploadedById: string;
};

export function PhotoSection({
  reportId,
  attachments: initialAttachments,
  isWriter,
}: {
  reportId: string;
  attachments: Attachment[];
  isWriter: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const photosToShow = [...initialAttachments].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

  const utils = trpc.useUtils();
  const uploadMutation = trpc.workflow.dailyReport.uploadAttachment.useMutation({
    onSuccess: () => {
      utils.workflow.dailyReport.getReport.invalidate({ reportId });
      toast.success("Photo uploaded");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.workflow.dailyReport.deleteAttachment.useMutation({
    onSuccess: () => {
      utils.workflow.dailyReport.getReport.invalidate({ reportId });
      toast.success("Photo deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const getGpsPosition = (): Promise<{ latitude: number; longitude: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000, enableHighAccuracy: true }
      );
    });
  };

  const stampGpsOnImage = async (dataUrl: string, gps: { latitude: number; longitude: number } | null, originalType: string): Promise<{ data: string; type: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);

        const stampText = gps
          ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}  |  ${format(new Date(), "dd MMM yyyy HH:mm")}`
          : format(new Date(), "dd MMM yyyy HH:mm");

        const fontSize = Math.max(12, Math.round(canvas.width * 0.025));
        ctx.font = `bold ${fontSize}px monospace`;
        const padding = fontSize * 0.6;
        const barHeight = fontSize * 1.6;
        const textWidth = ctx.measureText(stampText).width;

        const barX = canvas.width - textWidth - padding * 3;
        const barY = canvas.height - barHeight - padding;
        const barW = textWidth + padding * 2;
        const barH = barHeight;

        // Sample luminance under stamp area to pick contrasting text color
        const imageData = ctx.getImageData(
          Math.max(0, Math.round(barX)),
          Math.max(0, Math.round(barY)),
          Math.min(canvas.width, Math.round(barW)),
          Math.min(canvas.height, Math.round(barH))
        );
        let totalLuma = 0;
        const pixelCount = imageData.data.length / 4;
        for (let i = 0; i < imageData.data.length; i += 4) {
          totalLuma += 0.299 * imageData.data[i] + 0.587 * imageData.data[i + 1] + 0.114 * imageData.data[i + 2];
        }
        const avgLuma = totalLuma / pixelCount / 255;
        const textColor = avgLuma > 0.6 ? "#222222" : "#ffffff";

        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(barX, barY, barW, barH);

        ctx.fillStyle = textColor;
        ctx.textBaseline = "middle";
        ctx.textAlign = "right";
        ctx.fillText(stampText, canvas.width - padding, canvas.height - barHeight / 2 - padding);

        // Preserve JPEG quality; convert PNG/WebP to JPEG
        const isJpeg = originalType === "image/jpeg" || originalType === "image/jpg";
        const outType = isJpeg ? "image/jpeg" : "image/jpeg";
        const quality = isJpeg ? 0.95 : 0.92;
        resolve({ data: canvas.toDataURL(outType, quality), type: "image/jpeg" });
      };
      img.onerror = () => reject(new Error("Failed to load image for stamping"));
      img.src = dataUrl;
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large — max 10 MB");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return;
    }

    setUploading(true);
    try {
      const rawData = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const gps = await getGpsPosition();
      const { data: stampedData, type: stampedType } = await stampGpsOnImage(rawData, gps, file.type);

      uploadMutation.mutate({
        reportId,
        fileName: file.name,
        fileType: stampedType,
        fileSize: Math.round(stampedData.length * 0.75),
        data: stampedData,
        latitude: gps?.latitude,
        longitude: gps?.longitude,
        takenAt: new Date().toISOString(),
      });
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this photo?")) return;
    deleteMutation.mutate({ id });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="h-4 w-4 text-success" /> Site Photos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {photosToShow.length === 0 && !isWriter ? (
          <p className="text-sm text-muted-foreground">No photos uploaded.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photosToShow.map((att) => (
              <div key={att.id} className="group relative rounded-lg border overflow-hidden">
                <button
                  type="button"
                  className="block aspect-square w-full overflow-hidden bg-muted"
                  onClick={() => setPreviewUrl(att.storageUrl || att.data)}
                >
                  <img
                    src={att.storageUrl || att.data}
                    alt={att.fileName}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </button>
                <div className="p-2">
                  <p className="truncate text-xs font-medium">{att.fileName}</p>
                  {att.latitude != null && (
                    <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {att.latitude.toFixed(4)}, {att.longitude?.toFixed(4)}
                    </p>
                  )}
                  {att.takenAt && (
                    <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {format(new Date(att.takenAt), "dd MMM HH:mm")}
                    </p>
                  )}
                </div>
                {isWriter && (
                  <button
                    type="button"
                    onClick={() => handleDelete(att.id)}
                    className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {isWriter && (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60 hover:bg-muted/50">
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <ImageIcon className="h-6 w-6" />
                    <span className="text-xs">Add photo</span>
                  </>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
            )}
          </div>
        )}
      </CardContent>
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreviewUrl(null)}>
          <img src={previewUrl} alt="" className="max-h-full max-w-full rounded" />
        </div>
      )}
    </Card>
  );
}
