"use client";

import { X } from "lucide-react";
import type { PostMedia } from "../apis/types";

export function FeedComposerMediaGrid({
  media,
  setMedia,
}: Readonly<{
  media: PostMedia[];
  setMedia: React.Dispatch<React.SetStateAction<PostMedia[]>>;
}>) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {media.map((item) => (
        <div key={item.storage_path} className="group relative overflow-hidden rounded-lg border border-border">
          {item.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed GCS URL, not a static asset
            <img src={item.url} alt="" className="h-28 w-full object-cover" />
          ) : (
            <video src={item.url} className="h-28 w-full bg-black object-cover" muted playsInline controls />
          )}
          <button
            type="button"
            aria-label="Remove attachment"
            onClick={() => setMedia((current) => current.filter((m) => m.storage_path !== item.storage_path))}
            className="absolute right-1 top-1 cursor-pointer rounded-full bg-background/90 p-1 text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
