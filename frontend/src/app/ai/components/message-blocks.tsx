"use client";

import type { ResponseBlock } from "../apis/types";
import { ComparisonBlock } from "./blocks/comparison-block";
import { BreakdownBlock } from "./blocks/breakdown-block";
import { TimelineBlock } from "./blocks/timeline-block";
import { RecommendationBlock } from "./blocks/recommendation-block";
import { ImageBlock } from "./blocks/image-block";
import { QuickRepliesBlock } from "./blocks/quick-replies-block";
import { LinkBlock } from "./blocks/link-block";

type MessageBlocksProps = {
  blocks: ResponseBlock[];
  /** Block actions and quick replies send their value as the user's next message. */
  onAction?: (value: string) => void;
  onSend?: (value: string) => void;
};

/**
 * Renders the structured blocks attached to an assistant turn. Unknown types are
 * skipped so the backend can ship a new block type before the frontend has a
 * component for it.
 */
export function MessageBlocks({ blocks, onAction, onSend }: MessageBlocksProps) {
  if (!blocks.length) return null;

  return (
    <div className="flex w-full flex-col gap-3">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "comparison":
            return <ComparisonBlock key={i} block={block} />;
          case "breakdown":
            return <BreakdownBlock key={i} block={block} />;
          case "timeline":
            return <TimelineBlock key={i} block={block} />;
          case "recommendation":
            return <RecommendationBlock key={i} block={block} onAction={onAction} />;
          case "image":
            return <ImageBlock key={i} block={block} />;
          case "quick_replies":
            return <QuickRepliesBlock key={i} block={block} onAction={onAction} onSend={onSend} />;
          case "link":
            return <LinkBlock key={i} block={block} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
