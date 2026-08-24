"use client";

import { useState } from "react";
import { Globe, Loader2, Lock, MoreHorizontal, Pin, SmilePlus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/hooks";
import { deleteFeedPost, removePostReaction, setPostReaction } from "../store/feed-slice";
import { POST_CLAMP_CHARS, POST_TYPE_STYLES, REACTION_CHOICES, VISIBILITY_LABELS } from "../const";
import { initials, relativeTime } from "../utils";
import type { FeedPostCardProps } from "../types";

const VISIBILITY_ICONS: Record<string, typeof Globe> = { everyone: Globe, business: Users, private: Lock };

/** An unknown post_type still has to render, so the accent falls back to neutral rather than crashing. */
const FALLBACK_STYLE = { accent: "border-l-border", badge: "bg-muted text-muted-foreground", label: "Post" };

export function FeedPostCard({ post, currentUserIsAuthor }: FeedPostCardProps) {
  const dispatch = useAppDispatch();
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const style = POST_TYPE_STYLES[post.post_type] ?? FALLBACK_STYLE;
  const authorName = post.business_name ?? `${post.author_first_name ?? ""} ${post.author_last_name ?? ""}`.trim();
  // Belt as well as braces: the API layer normalizes these, but a card must never be the thing that throws.
  const media = post.media ?? [];
  const reactions = post.reactions ?? [];
  const VisibilityIcon = VISIBILITY_ICONS[post.visibility] ?? Globe;

  // Length heuristic rather than measuring the DOM — cheap, and a couple of characters either way does not
  // matter for a "Read more" affordance.
  const isLong = post.content.length > POST_CLAMP_CHARS;
  const body = isLong && !expanded ? `${post.content.slice(0, POST_CLAMP_CHARS).trimEnd()}…` : post.content;

  const confirmAndDelete = async () => {
    setDeleting(true);
    const result = await dispatch(deleteFeedPost(post.id));
    setDeleting(false);
    if (deleteFeedPost.rejected.match(result)) {
      // Keep the dialog open so the user can retry rather than wondering whether it worked.
      toast.error("Couldn't delete the post", { description: result.error.message });
      return;
    }
    setConfirmDelete(false);
  };

  // The client knows its own reaction, so it picks the method. The server has no toggle:
  // POST adds or updates, DELETE removes.
  const applyReaction = (emoji: string) => {
    setPickerOpen(false);
    if (post.my_reaction === emoji) dispatch(removePostReaction(post.id));
    else dispatch(setPostReaction({ id: post.id, emoji }));
  };

  return (
    <Card className={cn("overflow-hidden border-l-4", style.accent)}>
      <CardContent className="space-y-3 px-4 pt-4 pb-0">
        {/* ── Header ── */}
        <div className="flex items-start gap-3">
          <Avatar className="size-10 shrink-0">
            {(post.business_logo_url || post.author_photo_url) && (
              <AvatarImage src={post.business_logo_url ?? post.author_photo_url ?? ""} alt={authorName} />
            )}
            <AvatarFallback>{initials(post.author_first_name, post.author_last_name)}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{authorName || "Someone"}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", style.badge)}>
                {style.label}
              </span>
              {post.is_pinned && <Pin className="h-3 w-3 text-primary" />}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>{relativeTime(post.created_at)}</span>
              <span aria-hidden>·</span>
              <VisibilityIcon className="h-3 w-3" />
              <span>{VISIBILITY_LABELS[post.visibility] ?? post.visibility}</span>
            </div>
          </div>

          {currentUserIsAuthor && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label="Post actions"
                    className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  />
                }
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* Destructive actions confirm first — a mis-tap on an overflow menu should not lose a post. */}
                <DropdownMenuItem
                  variant="destructive"
                  className="cursor-pointer"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 /> Delete post
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* ── Body ── */}
        {post.content && (
          <div className="space-y-1">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{body}</p>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="cursor-pointer text-sm font-medium text-primary hover:underline"
              >
                {expanded ? "Show less" : "Read more"}
              </button>
            )}
          </div>
        )}

        {media.length > 0 && (
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
        )}

        {/* ── Reactions ── */}
        <div className="-mx-4 flex items-center gap-1.5 border-t border-border px-4 py-2">
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
                    <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">
                      +{group.count - group.reactors.length}
                    </span>
                  )}
                </span>
              </button>
            );
          })}

          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label="Add a reaction"
                  className="cursor-pointer rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                />
              }
            >
              <SmilePlus className="h-4 w-4" />
            </PopoverTrigger>
            {pickerOpen && (
              <PopoverContent align="start" className="w-auto p-1">
                <div className="flex gap-0.5">
                  {REACTION_CHOICES.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => applyReaction(emoji)}
                      className={cn(
                        "cursor-pointer rounded-md px-1.5 py-1 text-base hover:bg-muted",
                        post.my_reaction === emoji && "bg-primary/10",
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            )}
          </Popover>

          {reactions.length === 0 && (
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setPickerOpen(true)}>
              Like
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete post?</DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. The post will be removed from the feed, along with its reactions.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" disabled={deleting} onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" className="cursor-pointer gap-1.5" disabled={deleting} onClick={confirmAndDelete}>
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
