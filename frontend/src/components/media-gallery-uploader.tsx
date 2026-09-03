"use client";

// Multi-image gallery editor: thumbnail grid + add/remove. `items` holds the raw storage paths
// (what gets persisted); `previewUrls` holds the parallel resolved, display-only URLs — kept
// separate so a save-without-editing never round-trips a temporary signed URL back into storage.
//
// ponytail: no drag-reorder or video/YouTube-embed support yet (V1's MediaUploader has both) —
// add if the gallery card actually needs them once it's wired up in Phase B.

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function MediaGalleryUploader({
  items,
  previewUrls,
  onUpload,
  onChange,
  max = 20,
}: Readonly<{
  items: string[];
  previewUrls: (string | null)[];
  onUpload: (file: File) => Promise<string>;
  onChange: (paths: string[]) => void;
  max?: number;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const room = Math.max(0, max - items.length);
      const picked = Array.from(files).slice(0, room);
      const paths = await Promise.all(picked.map((f) => onUpload(f)));
      onChange([...items, ...paths]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {items.map((path, index) => (
          <div key={path} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
            {previewUrls[index] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrls[index]!} alt="" className="size-full object-cover" />
            )}
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow transition-opacity group-hover:opacity-100 cursor-pointer"
              aria-label="Remove image"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}

        {items.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary cursor-pointer",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            <span className="text-xs font-medium">Add media</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
