"use client";

// Multi-file dropzone for service media (images/videos/PDFs), styled after the shared
// image-dropzone.tsx but accepting multiple files up to a cap, with a thumbnail list below.

import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { FileText, ImagePlus, Loader2, Play, Trash2, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServiceMediaFile } from "../../apis";

const ACCEPT = "image/*,video/mp4,video/webm,video/quicktime,application/pdf";
const MAX_FILES = 10;

function FileIcon({ mimeType }: Readonly<{ mimeType: string }>) {
  if (mimeType.startsWith("image/")) return <ImagePlus className="h-5 w-5" />;
  if (mimeType.startsWith("video/")) return <Video className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

/** Photos and videos fill their tile (cropped, not letterboxed); other files show their icon,
 * name and type so a PDF reads as a document rather than an empty box. */
function MediaThumb({ file }: Readonly<{ file: ServiceMediaFile }>) {
  const zoom = "size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105";
  if (file.mime_type.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={file.url} alt="" className={zoom} />;
  }
  if (file.mime_type.startsWith("video/")) {
    return (
      <>
        <video src={file.url} className={zoom} muted preload="metadata" />
        <span className="absolute inset-0 m-auto flex size-10 items-center justify-center rounded-full bg-background/85 text-foreground shadow-md">
          <Play className="ml-0.5 size-4" />
        </span>
      </>
    );
  }
  const ext = file.original_name.split(".").pop()?.toUpperCase() ?? "FILE";
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-primary/5 p-3 text-center text-primary">
      <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10"><FileIcon mimeType={file.mime_type} /></span>
      <span className="line-clamp-2 max-w-full break-all text-xs font-medium text-foreground">{file.original_name}</span>
      <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold">{ext}</span>
    </div>
  );
}

export function ServiceMediaUploader({
  files,
  onUpload,
  onDelete,
  showDropzone = true,
}: Readonly<{
  files: ServiceMediaFile[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (fileId: number) => Promise<void>;
  showDropzone?: boolean;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const room = MAX_FILES - files.length;
  // The feature tile is the first photo — a PDF or video makes a poor 2×2 cover.
  const featured = files.length > 2 ? files.findIndex((f) => f.mime_type.startsWith("image/")) : -1;

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0 || room <= 0) return;
    const picked = Array.from(list).slice(0, room);
    setUploading(true);
    try {
      for (const file of picked) {
        await onUpload(file);
      }
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDelete = async (fileId: number) => {
    setDeletingId(fileId);
    try {
      await onDelete(fileId);
    } catch (err) {
      toast.error("Couldn't remove file", { description: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {files.length > 0 && (
        // Fixed-height rows, the first photo spans 2×2 as the feature tile, and dense flow back-fills
        // any gap it leaves — so mixed files still form an even grid (5 on 4 columns = two full rows).
        <div className="stagger-in grid grid-flow-dense auto-rows-[120px] grid-cols-2 gap-3 sm:auto-rows-[140px] sm:grid-cols-3 md:grid-cols-4">
          {files.map((f, i) => (
            <a
              key={f.id} href={f.url} target="_blank" rel="noreferrer"
              className={cn(
                "group relative overflow-hidden rounded-xl border bg-muted transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary",
                i === featured && "col-span-2 row-span-2",
              )}
              title={f.original_name}
            >
              <MediaThumb file={f} />
              {!f.mime_type.startsWith("application/") && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/60 to-transparent px-2.5 pb-2 pt-6 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {f.original_name}
                </span>
              )}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); handleDelete(f.id); }}
                disabled={deletingId === f.id}
                className="absolute right-1.5 top-1.5 z-10 flex size-7 cursor-pointer items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow transition-opacity hover:text-destructive group-hover:opacity-100 group-focus-visible:opacity-100 focus-visible:opacity-100"
                aria-label="Remove file"
              >
                {deletingId === f.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              </button>
            </a>
          ))}
        </div>
      )}

      {showDropzone && room > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Service media</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            disabled={uploading}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-8 text-center transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
            )}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <div className="flex gap-1 text-muted-foreground">
                <ImagePlus className="h-4 w-4" /><Video className="h-4 w-4" /><FileText className="h-4 w-4" />
              </div>
            )}
            <p className="text-sm font-medium text-primary">Click or drag files here</p>
            <p className="text-xs text-muted-foreground">Images, videos & PDFs supported · up to {MAX_FILES} files</p>
          </button>
          <input
            ref={inputRef} type="file" accept={ACCEPT} multiple hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      )}

      {showDropzone && room <= 0 && (
        <p className="text-center text-xs text-muted-foreground">Media limit reached ({MAX_FILES} files max).</p>
      )}
    </div>
  );
}
