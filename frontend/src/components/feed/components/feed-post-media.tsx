"use client";

import { cn } from "@/lib/utils";
import type { PostMedia } from "../apis/types";

export function FeedPostMedia({ media }: Readonly<{ media: PostMedia[] }>) {
  return (
    <div className={cn("grid gap-2", media.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
      {media.map((item) =>
        item.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset
          <img
            key={item.storage_path}
            src={item.url}
            alt=""
            className="max-h-96 w-full rounded-lg border border-border object-cover"
          />
        ) : (
          <video
            key={item.storage_path}
            src={item.url}
            controls
            playsInline
            className="max-h-96 w-full rounded-lg border border-border bg-black object-cover"
          />
        ),
      )}
    </div>
  );
}
