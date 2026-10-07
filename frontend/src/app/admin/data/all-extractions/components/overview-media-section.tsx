"use client";

import { Image as ImageIcon, ImagePlus } from "lucide-react";
import { EditableField } from "./editable-field";

const MAX_MEDIA = 3;

function Thumb({ src }: Readonly<{ src: string | null }>) {
  return (
    <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- extracted photos are arbitrary remote hosts
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}

/**
 * The overview's cover photo and up to 3 media photos (picked from the homepage during extraction),
 * each with a preview and an editable URL. Copied onto the institution's profile cover and Media
 * section when it's created or backfilled.
 */
export function OverviewMediaSection({
  coverUrl, gallery, onSaveCover, onSaveGallery,
}: Readonly<{
  coverUrl: string | null;
  gallery: string[];
  onSaveCover: (next: string | null) => Promise<unknown>;
  onSaveGallery: (next: string[]) => Promise<unknown>;
}>) {
  // Clearing a slot drops it; the rest keep their order.
  const saveSlot = (i: number, next: string | null) => {
    const slots = Array.from({ length: MAX_MEDIA }, (_, j) => (j === i ? next : gallery[j]) ?? null);
    return onSaveGallery(slots.map((s) => s?.trim()).filter((s): s is string => !!s));
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center gap-2">
        <ImagePlus className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold text-foreground">Cover & Media</h4>
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <Thumb src={coverUrl} />
          <EditableField label="Cover image URL" value={coverUrl} onSave={onSaveCover} className="flex-1" />
        </div>
        {Array.from({ length: MAX_MEDIA }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Thumb src={gallery[i] ?? null} />
            <EditableField label={`Media ${i + 1} URL`} value={gallery[i] ?? null} onSave={(v) => saveSlot(i, v)} className="flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
