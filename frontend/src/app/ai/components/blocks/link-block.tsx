"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResponseBlock } from "../../apis/types";

type LinkBlockProps = {
  block: Extract<ResponseBlock, { type: "link" }>;
};

/** Server-built deep link (e.g. "View all matching courses" → /search with filters). */
export function LinkBlock({ block }: LinkBlockProps) {
  // Blocks are stored data — only in-app paths get rendered as navigation.
  if (!block.url.startsWith("/")) return null;

  return (
    <Button variant="outline" size="sm" className="self-start" render={<Link href={block.url} target="_blank" rel="noopener noreferrer" />}>
      {block.label}
      <ArrowRight className="size-3.5" />
    </Button>
  );
}
