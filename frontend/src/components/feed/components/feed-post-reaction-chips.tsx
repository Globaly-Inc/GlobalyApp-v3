"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { FeedPost, ReactionGroup } from "../apis/types";

export function FeedPostReactionChips({
  post,
  reactions,
  applyReaction,
}: Readonly<{
  post: FeedPost;
  reactions: ReactionGroup[];
  applyReaction: (emoji: string) => void;
}>) {
  return (
    <>
      {reactions.map((group) => {
        const mine = post.my_reaction === group.emoji;
        return (
          <button
            key={group.emoji}
            type="button"
            onClick={() => applyReaction(group.emoji)}
            aria-pressed={mine}
            title={`${group.count} × ${group.emoji}`}
            className={cn(
              "flex cursor-pointer items-center gap-1 rounded-full border px-1.5 py-0.5 transition-colors",
              mine ? "border-primary/40 bg-primary/10" : "border-transparent bg-muted hover:bg-muted/70",
            )}
          >
            <span className="text-sm leading-none">{group.emoji}</span>
            {/* Reactor avatars, overlapping, with a +N overflow — who reacted, not just how many. */}
            <span className="flex items-center">
              {group.reactors.map((reactor, index) => (
                <Avatar
                  key={`${group.emoji}-${index}`}
                  className="size-4 -ml-1 border border-background first:ml-0"
                >
                  {reactor.photo_url && <AvatarImage src={reactor.photo_url} alt={reactor.first_name ?? ""} />}
                  <AvatarFallback className="text-[8px]">
                    {reactor.first_name?.[0]?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
              ))}
              {group.count > group.reactors.length && (
                <span className="ml-0.5 text-xs font-medium text-muted-foreground">
                  +{group.count - group.reactors.length}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </>
  );
}
