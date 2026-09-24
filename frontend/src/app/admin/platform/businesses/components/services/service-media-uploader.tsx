"use client";

// Multi-file dropzone for service media (images/videos/PDFs), styled after the shared
// image-dropzone.tsx but accepting multiple files up to a cap, with a thumbnail list below.

import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { FileText, ImagePlus, Loader2, Trash2, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServiceMediaFile } from "../../apis/types";

const ACCEPT = "image/*,video/mp4,video/webm,video/quicktime,application/pdf";
const MAX_FILES = 10;

function FileIcon({ mimeType }: Readonly<{ mimeType: string }>) {
  if (mimeType.startsWith("image/")) return <ImagePlus className="h-5 w-5" />;
  if (mimeType.startsWith("video/")) return <Video className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

function MediaThumb({ file }: Readonly<{ file: ServiceMediaFile }>) {
  if (file.mime_type.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={file.url} alt="" className="size-full object-contain" />;
  }
  if (file.mime_type.startsWith("video/")) {
    return <video src={file.url} className="size-full object-contain" muted />;
  }
  return (
    <div className="flex size-full items-center justify-center bg-primary/10 text-primary">
      <FileIcon mimeType={file.mime_type} />
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {files.map((f) => (
            <a
              key={f.id} href={f.url} target="_blank" rel="noreferrer"
              className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
              title={f.original_name}
            >
              <MediaThumb file={f} />
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); handleDelete(f.id); }}
                disabled={deletingId === f.id}
                className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow transition-opacity group-hover:opacity-100 cursor-pointer"
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
