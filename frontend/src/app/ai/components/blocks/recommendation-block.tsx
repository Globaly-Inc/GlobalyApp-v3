"use client";

import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ResponseBlock } from "../../apis/types";

type RecommendationBlockProps = {
  block: Extract<ResponseBlock, { type: "recommendation" }>;
  /** Clicking an action sends its value as the user's next message. */
  onAction?: (value: string) => void;
};

/** Career/field recommendation card. Specific courses use CourseCard instead. */
export function RecommendationBlock({ block, onAction }: RecommendationBlockProps) {
  return (
    <div className="w-full overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="h-1 bg-gradient-to-r from-primary via-primary/60 to-primary/20" />
      {/* ponytail: image_url rendered with plain <img> — remote hosts are unknown to next/image config */}
      {block.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.image_url} alt={block.title} className="max-h-40 w-full object-cover" />
      )}
      <div className="p-4">
        <p className="flex items-center gap-1.5 font-semibold">
          <Sparkles className="size-4 text-primary" /> {block.title}
        </p>
        {block.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{block.subtitle}</p>}
        {block.description && <p className="mt-2 text-sm leading-relaxed">{block.description}</p>}
        {!!block.tags?.length && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {block.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="border-0 bg-primary/10 text-primary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        {!!block.actions?.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            {block.actions.map((action) => (
              <Button key={action.label} variant="outline" size="sm" onClick={() => onAction?.(action.value)}>
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
