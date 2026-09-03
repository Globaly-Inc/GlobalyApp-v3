"use client";

import { useState } from "react";
import { Loader2, SmilePlus, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { REACTION_CHOICES } from "../const";
import { initials, relativeTime } from "../utils";
import { renderFormattedContent } from "../utils/format-content";
import type { FeedComment } from "../apis/types";

export function FeedCommentList({
  comments,
  loading,
  onReact,
  onRemoveReaction,
  onDelete,
}: Readonly<{
  comments: FeedComment[];
  loading: boolean;
  onReact: (commentId: number, emoji: string) => void;
  onRemoveReaction: (commentId: number) => void;
  onDelete: (commentId: number) => void;
}>) {
  const [pickerOpenFor, setPickerOpenFor] = useState<number | null>(null);

  const applyReaction = (comment: FeedComment, emoji: string) => {
    setPickerOpenFor(null);
    if (comment.my_reaction === emoji) onRemoveReaction(comment.id);
    else onReact(comment.id, emoji);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (comments.length === 0) return null;

  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <div key={comment.id} className="group flex items-start gap-2">
          <Avatar className="size-8 shrink-0">
            {comment.author_photo_url && <AvatarImage src={comment.author_photo_url} alt="" />}
            <AvatarFallback className="text-xs">
              {initials(comment.author_first_name, comment.author_last_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="rounded-2xl bg-muted/50 px-3.5 py-2.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-semibold">
                  {`${comment.author_first_name ?? ""} ${comment.author_last_name ?? ""}`.trim() || "Someone"}
                </span>
                <span className="text-xs text-muted-foreground">{relativeTime(comment.created_at)}</span>
              </div>
              {comment.content && (
                <div className="mt-0.5 space-y-1 text-sm leading-relaxed">
                  {renderFormattedContent(comment.content, comment.mentions)}
                </div>
              )}
              {comment.media.map((item) =>
                item.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset
                  <img
                    key={item.storage_path}
                    src={item.url}
                    alt=""
                    className="mt-1.5 max-h-48 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <video
                    key={item.storage_path}
                    src={item.url}
                    controls
                    playsInline
                    className="mt-1.5 max-h-48 rounded-lg border border-border bg-black object-cover"
                  />
                ),
              )}
            </div>

            {comment.reactions.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1 pl-1">
                {comment.reactions.map((group) => (
                  <button
                    key={group.emoji}
                    type="button"
                    onClick={() => applyReaction(comment, group.emoji)}
                    title={`${group.count} × ${group.emoji}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] transition-colors",
                      comment.my_reaction === group.emoji
                        ? "border-primary/40 bg-primary/10"
                        : "border-transparent bg-muted hover:bg-muted/70",
                    )}
                  >
                    <span>{group.emoji}</span>
                    <span className="text-muted-foreground">{group.count}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-1 flex items-center gap-3 pl-1 text-muted-foreground">
              <Popover
                open={pickerOpenFor === comment.id}
                onOpenChange={(open) => setPickerOpenFor(open ? comment.id : null)}
              >
                <PopoverTrigger render={<button type="button" aria-label="React to comment" className="hover:text-foreground" />}>
                  <SmilePlus className="h-3.5 w-3.5" />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-1">
                  <div className="flex gap-0.5">
                    {REACTION_CHOICES.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => applyReaction(comment, emoji)}
                        className={cn(
                          "cursor-pointer rounded-md px-1.5 py-1 text-base hover:bg-muted",
                          comment.my_reaction === emoji && "bg-primary/10",
                        )}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              {comment.is_mine && (
                <button
                  type="button"
                  onClick={() => onDelete(comment.id)}
                  aria-label="Delete comment"
                  className="cursor-pointer opacity-0 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
