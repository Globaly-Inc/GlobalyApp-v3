"use client";

import { useRef } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { COVER_ACCEPT, MAX_COVER_MB } from "../const";

/**
 * Cover image: pick → upload → preview, before the listing is saved.
 *
 * Uploading first keeps the create/update request small JSON and means the preview is the real uploaded
 * object, not a local blob that might not have made it. V2 previewed a base64 string and, on failure, could
 * leave a listing pointing at nothing.
 *
 * `available` is false when the environment has no storage bucket configured. The field then renders nothing
 * at all — a disabled control that can only fail is worse than an absent optional one, and the cover is
 * optional.
 */
export function CoverImageField({
  available,
  previewUrl,
  uploading,
  onPick,
  onRemove,
}: Readonly<{
  available: boolean;
  previewUrl: string | null;
  uploading: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  if (!available) return null;

  return (
    <div className="flex flex-col gap-2">
      <Label>Cover image</Label>

      {previewUrl ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted">
          <Image src={previewUrl} alt="Cover preview" fill className="object-cover" sizes="672px" unoptimized />
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove cover image"
            className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 text-foreground shadow-sm hover:bg-background cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="h-auto w-full flex-col gap-1 py-6"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
          <span className="text-sm">{uploading ? "Uploading…" : "Add a cover image"}</span>
          <span className="text-xs text-muted-foreground">JPG, PNG or WebP · up to {MAX_COVER_MB}MB</span>
        </Button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={COVER_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset the input so re-picking the same file still fires a change event.
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
    </div>
  );
}
