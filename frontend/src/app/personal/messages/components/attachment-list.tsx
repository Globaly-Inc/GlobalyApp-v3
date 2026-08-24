"use client";

import { useState } from "react";
import { Download, FileText, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileExtension, formatFileSize, isImageFile, isPdfFile, isVideoFile } from "../utils";
import { AttachmentPreviewDialog } from "./attachment-preview-dialog";
import { PdfViewer } from "./pdf-viewer";
import type { MessageAttachment } from "../apis/types";

/**
 * Attachments under a message — GlobalyOS V2's `AttachmentRenderer`: images in a grid
 * whose column count follows the count, videos with native controls, PDFs previewed
 * inline, and everything else as a bordered file card with its size and a download link.
 *
 * PDFs render through `./pdf-viewer`, a port of V2's canvas viewer — see that file for the
 * `pdfjs-dist` install it needs.
 *
 * V2 fetches each file through a signed-URL endpoint on click and streams it into a blob
 * to force a download. Here the signed view URL already arrives with the message, so the
 * download is a plain `<a download>` — the browser does the work.
 */

/** V2's `getGridCols`: one image goes full width, two side by side, more in threes. */
const gridColumns = (count: number) => (count === 1 ? "grid-cols-1" : count === 2 ? "grid-cols-2" : "grid-cols-3");

/**
 * The hover-revealed Download pill V2 overlays on every media tile — a labelled button,
 * not a bare icon, because on a photo the word is what makes it findable.
 */
function DownloadPill({ attachment }: Readonly<{ attachment: MessageAttachment }>) {
  return (
    <a
      href={attachment.url}
      download={attachment.original_name}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Download ${attachment.original_name}`}
      className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100"
    >
      <Download className="size-3" aria-hidden />
      Download
    </a>
  );
}

/** The hover-revealed expand affordance shared by every previewable attachment. */
function ExpandButton({ onClick, label }: Readonly<{ onClick: () => void; label: string }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="absolute left-1.5 top-1.5 flex size-7 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-foreground opacity-0 shadow-sm transition-opacity hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100"
    >
      <Maximize2 className="size-3.5" />
    </button>
  );
}

export function AttachmentList({ attachments }: Readonly<{ attachments: MessageAttachment[] }>) {
  const [previewing, setPreviewing] = useState<MessageAttachment | null>(null);

  /**
   * V2 streams each file into a blob and saves them in a loop. Here the signed URLs are
   * already in hand, so each one is a synthetic `<a download>` click — but staggered,
   * because browsers drop downloads fired in the same tick as duplicates.
   */
  const downloadAll = () => {
    attachments.forEach((attachment, i) => {
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = attachment.url;
        link.download = attachment.original_name;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, i * 300);
    });
  };

  if (attachments.length === 0) return null;

  const images = attachments.filter((a) => isImageFile(a.mime_type));
  const videos = attachments.filter((a) => isVideoFile(a.mime_type));
  const pdfs = attachments.filter(
    (a) => !isImageFile(a.mime_type) && !isVideoFile(a.mime_type) && isPdfFile(a.mime_type, a.original_name),
  );
  const files = attachments.filter(
    (a) => !isImageFile(a.mime_type) && !isVideoFile(a.mime_type) && !isPdfFile(a.mime_type, a.original_name),
  );

  return (
    <>
      <div className="mt-2 space-y-2">
        {/* V2's download-all bar — only once there is more than one file to act on. */}
        {attachments.length > 1 && (
          <div className="flex max-w-[320px] items-center justify-between rounded-md bg-muted/50 px-2 py-1.5">
            <span className="text-xs text-muted-foreground">{attachments.length} attachments</span>
            <button
              type="button"
              onClick={downloadAll}
              className="flex h-6 cursor-pointer items-center gap-1 rounded px-2 text-xs transition-colors hover:bg-muted"
            >
              <Download className="size-3" aria-hidden />
              Download all
            </button>
          </div>
        )}

        {images.length > 0 && (
          <div className={cn("grid max-w-md gap-1.5", gridColumns(images.length))}>
            {images.map((attachment) => (
              <div
                key={attachment.storage_path}
                className={cn(
                  "group relative overflow-hidden rounded-lg border border-border bg-muted",
                  images.length === 1 ? "max-w-sm" : "aspect-square",
                )}
              >
                <button
                  type="button"
                  onClick={() => setPreviewing(attachment)}
                  className="block size-full cursor-pointer"
                  aria-label={`Preview ${attachment.original_name}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, expiring, per-viewer URL */}
                  <img
                    src={attachment.url}
                    alt={attachment.original_name}
                    className={cn("size-full object-cover", images.length === 1 && "max-h-80")}
                    loading="lazy"
                  />
                </button>
                <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent p-1.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {attachment.original_name}
                </span>
                <DownloadPill attachment={attachment} />
              </div>
            ))}
          </div>
        )}

        {videos.map((attachment) => (
          <div key={attachment.storage_path} className="group relative w-fit">
            <video
              src={attachment.url}
              controls
              preload="metadata"
              className="max-h-80 max-w-sm rounded-lg border border-border bg-black"
            />
            <ExpandButton onClick={() => setPreviewing(attachment)} label={`Expand ${attachment.original_name}`} />
            <DownloadPill attachment={attachment} />
          </div>
        ))}

        {/* Inline PDF preview — the file itself, not just a card about it. */}
        {pdfs.map((attachment) => (
          <div
            key={attachment.storage_path}
            className="group relative max-w-md overflow-hidden rounded-lg border border-border bg-card"
          >
            <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-2.5 py-1.5">
              <FileText className="size-3.5 shrink-0 text-destructive" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{attachment.original_name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {formatFileSize(attachment.size_bytes)}
              </span>
              <a
                href={attachment.url}
                download={attachment.original_name}
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Download ${attachment.original_name}`}
                title="Download"
              >
                <Download className="size-3" />
              </a>
            </div>
            <PdfViewer
              key={attachment.storage_path}
              fileUrl={attachment.url}
              fileName={attachment.original_name}
              mode="inline"
              onExpand={() => setPreviewing(attachment)}
            />
          </div>
        ))}

        {files.map((attachment) => (
          <div
            key={attachment.storage_path}
            className="flex max-w-sm items-center gap-2.5 rounded-lg border border-border bg-card p-2"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <FileText className="size-4" aria-hidden />
            </div>
            <button
              type="button"
              onClick={() => setPreviewing(attachment)}
              className="min-w-0 flex-1 cursor-pointer text-left"
            >
              <p className="truncate text-sm font-medium">{attachment.original_name}</p>
              <p className="text-xs text-muted-foreground">
                {fileExtension(attachment.original_name)} · {formatFileSize(attachment.size_bytes)}
              </p>
            </button>
            <a
              href={attachment.url}
              download={attachment.original_name}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Download ${attachment.original_name}`}
              title="Download"
            >
              <Download className="size-3.5" />
            </a>
          </div>
        ))}
      </div>

      <AttachmentPreviewDialog
        attachment={previewing}
        open={previewing !== null}
        onOpenChange={(open) => !open && setPreviewing(null)}
      />
    </>
  );
}
