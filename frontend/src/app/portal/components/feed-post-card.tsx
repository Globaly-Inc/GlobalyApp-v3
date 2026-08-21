"use client";

import { useState } from "react";
import {
  Globe,
  Loader2,
  Lock,
  MessageSquare as MessageSquareIcon,
  MoreHorizontal,
  Pin,
  SmilePlus,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/hooks";
import { deleteFeedPost, removePostReaction, setPostReaction } from "../store/feed-slice";
import { POST_CLAMP_CHARS, POST_TYPE_STYLES, REACTION_CHOICES, VISIBILITY_LABELS } from "../const";
import { initials, relativeTime } from "../utils";
import type { FeedPostCardProps } from "../types";

const VISIBILITY_ICONS: Record<string, typeof Globe> = { everyone: Globe, business: Users, private: Lock };

/** An unknown post_type still has to render, so the accent falls back to neutral rather than crashing. */
const FALLBACK_STYLE = {
  accent: "border-l-border",
  badge: "bg-muted text-muted-foreground",
  label: "Post",
  icon: MessageSquareIcon,
};

/**
 * Structure and spacing follow V1's FeedPostCard: a border-l-4 accent on the card, a p-4 pb-0 header, the
 * body on px-4 py-3, and a px-4 py-3 border-t footer with reactions on the left.
 */
export function FeedPostCard({ post, currentUserIsAuthor }: FeedPostCardProps) {
  const dispatch = useAppDispatch();
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const style = POST_TYPE_STYLES[post.post_type] ?? FALLBACK_STYLE;
  const TypeIcon = style.icon;
  const authorName = `${post.author_first_name ?? ""} ${post.author_last_name ?? ""}`.trim();
  // Belt as well as braces: the API layer normalizes these, but a card must never be the thing that throws.
  const media = post.media ?? [];
  const reactions = post.reactions ?? [];
  const VisibilityIcon = VISIBILITY_ICONS[post.visibility] ?? Globe;

  // Length heuristic rather than measuring the DOM — a couple of characters either way does not matter.
  const isLong = post.content.length > POST_CLAMP_CHARS;
  const body = isLong && !expanded ? `${post.content.slice(0, POST_CLAMP_CHARS).trimEnd()}…` : post.content;

  const applyReaction = (emoji: string) => {
    setPickerOpen(false);
    if (post.my_reaction === emoji) dispatch(removePostReaction(post.id));
    else dispatch(setPostReaction({ id: post.id, emoji }));
  };

  const confirmAndDelete = async () => {
    setDeleting(true);
    const result = await dispatch(deleteFeedPost(post.id));
    setDeleting(false);
    if (deleteFeedPost.rejected.match(result)) {
      toast.error("Couldn't delete the post", { description: result.error.message });
      return;
    }
    setConfirmDelete(false);
  };

  return (
    <Card className={cn("overflow-hidden border-l-4 transition-shadow hover:shadow-md", style.accent)}>
      {/* Header */}
      <div className="p-4 pb-0">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10 ring-2 ring-background">
              {(post.business_logo_url || post.author_photo_url) && (
                <AvatarImage src={post.business_logo_url ?? post.author_photo_url ?? ""} alt={authorName} />
              )}
              <AvatarFallback className={style.badge}>
                {initials(post.author_first_name, post.author_last_name)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground truncate">{authorName || "Someone"}</span>
                {post.business_name && <span className="text-xs text-muted-foreground">• {post.business_name}</span>}
                <Badge variant="secondary" className={cn("text-xs gap-1", style.badge)}>
                  <TypeIcon className="h-3 w-3" />
                  {style.label}
                </Badge>
                {post.is_pinned && (
                  <Badge variant="outline" className="text-xs gap-1 text-orange-600 border-orange-300">
                    <Pin className="h-3 w-3" />
                    Pinned
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-muted-foreground text-sm">{relativeTime(post.created_at)}</span>
                <span className="text-muted-foreground/50">·</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <VisibilityIcon className="h-3 w-3" />
                  {VISIBILITY_LABELS[post.visibility] ?? post.visibility}
                </span>
              </div>
            </div>
          </div>

          {currentUserIsAuthor && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Post actions" />}
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* Destructive actions confirm first — a mis-tap on an overflow menu should not lose a post. */}
                <DropdownMenuItem variant="destructive" className="cursor-pointer" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Content */}
      {post.content && (
        <div className="px-4 py-3">
          <p className="text-sm whitespace-pre-wrap">{body}</p>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="mt-1 cursor-pointer text-sm font-medium text-primary hover:underline"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}

      {/* Media */}
      {media.length > 0 && (
        <div className={cn("grid gap-0.5", media.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {media.map((item) =>
            item.type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset
              <img key={item.storage_path} src={item.url} alt="" className="max-h-96 w-full object-cover" />
            ) : (
              <video
                key={item.storage_path}
                src={item.url}
                controls
                playsInline
                className="max-h-96 w-full bg-black object-cover"
              />
            ),
          )}
        </div>
      )}

      {/* Reactions */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center gap-1.5">
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
                  "flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                  mine
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-transparent bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                <span className="text-sm leading-none">{group.emoji}</span>
                <span className="font-medium">{group.count}</span>
              </button>
            );
          })}

          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  aria-label="Add a reaction"
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

          {/* V1 shows a comment count on the right of this row. There is no comments table in this codebase,
              so the control is omitted rather than rendered as a button that cannot do anything. */}
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete post?</DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. The post will be removed from the feed, along with its reactions.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="cursor-pointer"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="cursor-pointer gap-1.5"
              disabled={deleting}
              onClick={confirmAndDelete}
            >
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
