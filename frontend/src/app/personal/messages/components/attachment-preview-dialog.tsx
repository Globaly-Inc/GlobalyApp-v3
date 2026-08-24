"use client";

import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatFileSize, isImageFile, isPdfFile, isVideoFile } from "../utils";
import { PdfViewer } from "./pdf-viewer";
import type { MessageAttachment } from "../apis/types";

/**
 * Full-size preview of one attachment — GlobalyOS V2's chat lightbox (`ImageLightbox` /
 * the `mode="lightbox"` branch of its PDF and video viewers), reached from the expand
 * control on an inline attachment.
 *
 * PDFs render through `./pdf-viewer` in `lightbox` mode — V2's canvas viewer, capped at
 * 80vh, with its page bar and download along the bottom.
 */
export function AttachmentPreviewDialog({
  attachment,
  open,
  onOpenChange,
}: Readonly<{
  attachment: MessageAttachment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  if (!attachment) return null;

  const image = isImageFile(attachment.mime_type);
  const video = isVideoFile(attachment.mime_type);
  const pdf = isPdfFile(attachment.mime_type, attachment.original_name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0 sm:max-w-5xl">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold">{attachment.original_name}</DialogTitle>
            <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size_bytes)}</p>
          </div>
          {/* pr-8 clears DialogContent's own close button. */}
          <div className="flex shrink-0 items-center gap-1 pr-8">
            <Button
              variant="ghost"
              size="icon-sm"
              render={<a href={attachment.url} target="_blank" rel="noopener noreferrer" />}
              title="Open in a new tab"
              aria-label="Open in a new tab"
            >
              <ExternalLink className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              render={<a href={attachment.url} download={attachment.original_name} />}
              title="Download"
              aria-label={`Download ${attachment.original_name}`}
            >
              <Download className="size-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-muted/30">
          {image ? (
            <div className="flex h-full items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed, expiring, per-viewer URL */}
              <img
                src={attachment.url}
                alt={attachment.original_name}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : video ? (
            <div className="flex h-full items-center justify-center p-4">
              <video src={attachment.url} controls autoPlay className="max-h-full max-w-full" />
            </div>
          ) : pdf ? (
            <div className="flex h-full items-center justify-center overflow-auto p-4">
              <PdfViewer
                key={attachment.storage_path}
                fileUrl={attachment.url}
                fileName={attachment.original_name}
                mode="lightbox"
              />
            </div>
          ) : (
            // Nothing the browser can render inline — offer the two things that work.
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                This file type can&apos;t be previewed in the browser.
              </p>
              <Button size="sm" render={<a href={attachment.url} download={attachment.original_name} />}>
                <Download className="size-3.5" />
                Download {attachment.original_name}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
