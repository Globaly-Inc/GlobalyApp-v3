"use client";

import type { ResponseBlock } from "../../apis/types";

type ImageBlockProps = {
  block: Extract<ResponseBlock, { type: "image" }>;
};

/** Image with optional title/caption — URLs come verbatim from RAG context. */
export function ImageBlock({ block }: ImageBlockProps) {
  return (
    <figure className="w-full overflow-hidden rounded-xl border bg-card shadow-xs">
      {block.title && <p className="border-b px-4 py-2.5 text-sm font-semibold">{block.title}</p>}
      {/* ponytail: plain <img> — AI-referenced hosts can't be allowlisted in next/image config */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={block.url} alt={block.title ?? block.caption ?? "Preview"} className="max-h-80 w-full object-contain" />
      {block.caption && (
        <figcaption className="px-4 py-2 text-xs text-muted-foreground">{block.caption}</figcaption>
      )}
    </figure>
  );
}
