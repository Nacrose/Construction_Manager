"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DropZone, DroppedImagePreview, useDroppedImages } from "@/components/drop-zone";
import { PhotoAnnotator } from "@/components/photo-annotator";
import { ImagePlus, Loader2, Trash2, X, MessageSquare, Pen } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

interface ReportImageAttachmentsProps {
  projectId: string;
  reportId: string;
  canEdit: boolean;
}

/**
 * ReportImageAttachments — drop zone for attaching images to a daily report.
 *
 * Images dropped here are sent as chat messages with:
 *  - linkedEntityType: "daily_report"
 *  - linkedEntityId: <reportId>
 *  - attachmentData: base64 image
 *  - text: short caption like "Photo attached to report DR-001"
 *
 * The images are stored in the chat message table and displayed here.
 * They're also visible in the project's communication tab, so the team
 * can discuss them.
 *
 * To send a chat message, we need a channel. We use the project's first
 * public channel (creating one if none exists).
 */
export function ReportImageAttachments({
  projectId,
  reportId,
  canEdit,
}: ReportImageAttachmentsProps) {
  const utils = trpc.useUtils();
  const { images, addImage, removeImage } = useDroppedImages();
  const [uploading, setUploading] = useState(false);
  const [annotateImageId, setAnnotateImageId] = useState<string | null>(null);
  const [imageOverrides, setImageOverrides] = useState<Record<string, string>>({});

  const annotateImage = images.find((i) => i.id === annotateImageId);

  function handleAnnotatedSave(dataUrl: string) {
    if (!annotateImageId) return;
    setImageOverrides((prev) => ({ ...prev, [annotateImageId]: dataUrl }));
    setAnnotateImageId(null);
    toast.success("Photo annotated");
  }

  // Get the effective image (override or original)
  function getImageSrc(img: typeof images[0]): string {
    return imageOverrides[img.id] ?? img.dataUrl;
  }

  // Fetch images already attached to this report
  const { data: existingImagesData, isLoading } = trpc.chat.listByEntity.useQuery({
    entityType: "daily_report",
    entityId: reportId,
    imagesOnly: true,
    limit: 50,
  });

  // Fetch channels to find/create one for this project
  const { data: channelsData } = trpc.chat.listChannels.useQuery({ projectId });

  const createChannelMut = trpc.chat.createChannel.useMutation({
    onSuccess: () => utils.chat.listChannels.invalidate({ projectId }),
  });

  const sendMessageMut = trpc.chat.sendMessage.useMutation({
    onSuccess: () => {
      utils.chat.listByEntity.invalidate({
        entityType: "daily_report",
        entityId: reportId,
      });
    },
  });

  const deleteMessageMut = trpc.chat.deleteMessage.useMutation({
    onSuccess: () => {
      utils.chat.listByEntity.invalidate({
        entityType: "daily_report",
        entityId: reportId,
      });
      toast.success("Image removed");
    },
    onError: (e) => toast.error(e.message),
  });

  // Find a suitable channel (preferably a "Photos" channel, else first public)
  const targetChannel = useMemo(() => {
    const channels = channelsData?.channels ?? [];
    if (channels.length === 0) return null;
    // Prefer channels with "photo" or "attachment" in the name
    const photoChannel = channels.find(
      (c) => /photo|attachment|file/i.test(c.name) && c.type === "public"
    );
    return photoChannel ?? channels.find((c) => c.type === "public") ?? channels[0];
  }, [channelsData]);

  async function uploadImages() {
    if (images.length === 0) return;
    setUploading(true);

    try {
      // Find or create a target channel
      let channelId = targetChannel?.id;
      if (!channelId) {
        const newChannel = await createChannelMut.mutateAsync({
          projectId,
          name: "📷 Site Photos",
          type: "public",
          description: "Site photos and report attachments",
        });
        channelId = newChannel.channel.id;
      }

      // Send each image as a chat message linked to this report
      for (const img of images) {
        // Use overridden (annotated) image if available, else original
        const dataUrl = getImageSrc(img);
        // Strip the data: prefix to get just the base64 data
        const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
        if (!match) continue;
        const [, mimeType, base64Data] = match;

        await sendMessageMut.mutateAsync({
          channelId,
          text: `📷 Photo attached to daily report ${reportId}`,
          attachmentData: base64Data,
          attachmentName: img.name,
          attachmentType: mimeType,
          linkedEntityType: "daily_report",
          linkedEntityId: reportId,
        });
      }

      toast.success(`Attached ${images.length} image${images.length === 1 ? "" : "s"} to report`);
      images.forEach((i) => removeImage(i.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload images");
    } finally {
      setUploading(false);
    }
  }

  function handleDeleteExisting(messageId: string) {
    if (!confirm("Remove this image from the report? It will also be deleted from chat.")) return;
    deleteMessageMut.mutate({ messageId });
  }

  const existingImages = existingImagesData?.messages ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ImagePlus className="h-4 w-4 text-amber-500" />
          Site Photos
          {existingImages.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">
              ({existingImages.length} attached)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Drag images from the chat panel (bottom-right) and drop them here to attach
          them to this report. You can also paste screenshots with Ctrl+V.
        </p>

        {/* Existing images */}
        {isLoading ? (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading attached images…
          </div>
        ) : existingImages.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {existingImages.map((msg) => (
              <div
                key={msg.id}
                className="relative group rounded-md border overflow-hidden h-24 w-24"
              >
                {msg.attachmentType && msg.attachmentData && (
                  <img
                    src={`data:${msg.attachmentType};base64,${msg.attachmentData}`}
                    alt={msg.attachmentName ?? "site photo"}
                    className="h-full w-full object-cover"
                  />
                )}
                {canEdit && (
                  <button
                    onClick={() => handleDeleteExisting(msg.id)}
                    className="absolute top-0.5 right-0.5 rounded-full bg-black/60 text-white p-0.5 opacity-0 group-hover:opacity-100 transition"
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">
                  {msg.user?.name} · {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            No photos attached yet.
          </p>
        )}

        {/* Drop zone for new images */}
        {canEdit && (
          <DropZone
            onDropImage={addImage}
            dropLabel="Drop images from chat here"
            className="rounded-lg border-2 border-dashed border-border p-4 min-h-[80px] flex items-center justify-center"
          >
            {images.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-2">
                <ImagePlus className="mx-auto h-6 w-6 mb-1 opacity-50" />
                Drop images here, or paste with Ctrl+V
              </div>
            ) : (
              <div className="w-full">
                {/* Custom preview with annotate buttons */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {images.map((img) => {
                    const src = getImageSrc(img);
                    const isAnnotated = !!imageOverrides[img.id];
                    return (
                      <div
                        key={img.id}
                        className="relative group rounded-md border overflow-hidden h-20 w-20"
                      >
                        <img
                          src={src}
                          alt={img.name}
                          className="h-full w-full object-cover"
                        />
                        {isAnnotated && (
                          <span className="absolute top-0.5 left-0.5 rounded bg-amber-500 text-white text-[8px] px-1 py-0.5 font-medium">
                            annotated
                          </span>
                        )}
                        <button
                          onClick={() => removeImage(img.id)}
                          className="absolute top-0.5 right-0.5 rounded-full bg-black/60 text-white p-0.5 opacity-0 group-hover:opacity-100 transition"
                          title="Remove"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setAnnotateImageId(img.id)}
                          className="absolute bottom-0.5 right-0.5 rounded-full bg-amber-500 text-white p-1 opacity-0 group-hover:opacity-100 transition"
                          title="Annotate"
                        >
                          <Pen className="h-3 w-3" />
                        </button>
                        <div className="absolute bottom-0 left-0 inset-x-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">
                          {img.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-end gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => images.forEach((i) => removeImage(i.id))}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={uploadImages}
                    disabled={uploading || images.length === 0}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      <>
                        <MessageSquare className="h-3 w-3 mr-1" />
                        Attach {images.length} to report
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DropZone>
        )}

        {/* Note about chat integration */}
        <p className="text-[10px] text-muted-foreground italic">
          Images are shared in the project&rsquo;s &ldquo;📷 Site Photos&rdquo; chat channel
          and linked to this report — team members can discuss them in chat.
          Hover over a thumbnail to annotate (draw markers, arrows, text).
        </p>
      </CardContent>

      {/* Photo annotation modal */}
      {annotateImage && (
        <PhotoAnnotator
          imageSrc={getImageSrc(annotateImage)}
          open={!!annotateImage}
          onOpenChange={(o) => !o && setAnnotateImageId(null)}
          onSave={handleAnnotatedSave}
        />
      )}
    </Card>
  );
}
