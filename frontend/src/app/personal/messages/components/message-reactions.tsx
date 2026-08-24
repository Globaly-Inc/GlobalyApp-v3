"use client";

import { SmilePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmojiPicker } from "./emoji-picker";
import type { MessageReaction } from "../apis/types";

/**
 * The reaction chip row under a message — GlobalyOS V2's `MessageReactions`: a pill per
 * emoji showing the count, tinted with a ring when you're one of the reactors, plus an
 * add-reaction button that opens the full picker.
 *
 * V2 splits each pill into two halves (emoji | stacked avatars) and stacks reactor
 * avatars via `ProfileStack`. A student thread has two participants, so a count carries
 * the same information as a stack of at most two faces — the reactors' names go in the
 * native tooltip instead, which is what V2's popover shows on click.
 *
 * V2 also keeps a local optimistic copy of the reactions; here the Redux reducer already
 * patches the chip on `fulfilled`, so there is no second source of truth to sync.
 */
export function MessageReactions({
  reactions,
  canReact,
  onToggle,
}: Readonly<{
  reactions: MessageReaction[];
  /** False on a closed thread — reacting writes to something both sides read. */
  canReact: boolean;
  onToggle: (emoji: string) => void;
}>) {
  // Nothing to show and nothing to add: a closed thread's un-reacted message.
  if (reactions.length === 0 && !canReact) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          disabled={!canReact}
          onClick={() => onToggle(reaction.emoji)}
          title={`${reaction.users.join(", ")} reacted with ${reaction.emoji}`}
          className={cn(
            "flex h-7 items-center gap-1 rounded-full px-2 text-xs transition-all",
            canReact ? "cursor-pointer" : "cursor-default",
            reaction.mine
              ? "bg-primary/10 ring-1 ring-primary/30 hover:bg-primary/20"
              : "bg-muted/60 hover:bg-muted",
          )}
        >
          <span className="text-sm leading-none">{reaction.emoji}</span>
          <span className="font-medium tabular-nums">{reaction.count}</span>
        </button>
      ))}

      {canReact && (
        <EmojiPicker
          onSelect={onToggle}
          side="top"
          align="start"
          closeOnSelect
          trigger={
            <button
              type="button"
              aria-label="Add a reaction"
              title="Add a reaction"
              className={cn(
                "flex size-7 cursor-pointer items-center justify-center rounded-full transition-all hover:bg-muted",
                // Always visible once there are chips to sit beside; otherwise it only
                // appears on hover, so an un-reacted message stays clean. V2 does this.
                reactions.length === 0 && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              )}
            >
              <SmilePlus className="size-3.5 text-muted-foreground" />
            </button>
          }
        />
      )}
    </div>
  );
}
