"use client";

import { Loader2, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Gallery URLs are signed storage paths — the last path segment is the closest thing to a name. */
const fileName = (url: string) => {
  const last = url.replace(/[?#].*$/, "").split("/").pop() ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};

/** One photo or video in the Media gallery, cropped to fill its fixed-height tile. */
export function MediaTile({
  url, type, index, featured, deleting, onRemove,
}: Readonly<{
  url: string;
  type: "gallery" | "video";
  index: number;
  /** The 2×2 cover tile. */
  featured: boolean;
  deleting: boolean;
  /** Omitted when read-only. */
  onRemove?: () => void;
}>) {
  const zoom = "size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105";
  const name = fileName(url);
  return (
    <div
      className={cn("group relative animate-row-rise overflow-hidden rounded-xl border bg-muted", featured && "col-span-2 row-span-2")}
      style={{ animationDelay: `${index * 50}ms` }}
      title={name}
    >
      {type === "gallery" ? (
        // eslint-disable-next-line @next/next/no-img-element -- externally stored gallery URL
        <img src={url} alt="" className={zoom} />
      ) : (
        <>
          <video src={url} className={cn(zoom, "bg-black")} muted preload="metadata" />
          <span className="absolute inset-0 m-auto flex size-10 items-center justify-center rounded-full bg-background/85 text-foreground shadow-md">
            <Play className="ml-0.5 size-4" />
          </span>
        </>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/60 to-transparent px-2.5 pb-2 pt-6 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
        {name}
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={type === "gallery" ? "Remove image" : "Remove video"}
          disabled={deleting}
          onClick={onRemove}
          className="absolute right-1.5 top-1.5 z-10 flex size-7 cursor-pointer items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
        >
          {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
        </button>
      )}
    </div>
  );
}
