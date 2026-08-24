"use client";

import { useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Copy,
  Forward,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Reply,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "./utils";
import { useChatCopy } from "./chat-copy";

/**
 * The floating toolbar that appears on message hover — GlobalyOS V2's
 * `MessageActionsToolbar`: same position (`-top-4 right-4`), same card styling, same
 * opacity-on-group-hover reveal, and the same overflow menu.
 *
 * The menu drops V2's "Copy link" — nobody outside the two participants can open one,
 * so a shareable URL to a message had no audience.
 *
 * Otherwise the menu matches V2, including who sees what:
 *   everyone — Copy text, Forward
 *   sender only — a separator, then Edit and Delete (destructive)
 *
 * Not reproduced: V2's quick-reaction row inside this toolbar. Reactions live in their
 * own chip row under the message here, which is also where V2 puts the add-reaction
 * button once a message has any.
 */
const MENU_ITEM = "h-8 w-full justify-start gap-2 font-normal";

export function MessageActions({
  body,
  isOwn,
  isStarred,
  isPinned,
  canPin,
  canModify,
  onToggleStar,
  onTogglePin,
  onReply,
  onEdit,
  onDelete,
  onForward,
}: Readonly<{
  body: string;
  /** Sender-only actions (Edit, Delete) hang off this. */
  isOwn: boolean;
  isStarred: boolean;
  isPinned: boolean;
  /** False on a closed thread — pinning changes what both sides see, so it is read-only. */
  canPin: boolean;
  /** False on a closed thread — editing and deleting are writes to a shared record. */
  canModify: boolean;
  onToggleStar: () => void;
  onTogglePin: () => void;
  /** Absent inside a thread panel — threads are one level deep. */
  onReply?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onForward: () => void;
}>) {
  const copy = useChatCopy();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleCopyText = async () => {
    setMenuOpen(false);
    if (await copyToClipboard(body)) toast.success("Message copied to clipboard");
    else toast.error("Couldn't copy the message");
  };

  return (
    <>
      <div
        className={cn(
          "absolute -top-4 right-4 z-10 flex items-center gap-0.5 rounded-lg border border-border bg-card px-1 py-0.5 shadow-lg",
          // The menu holds the toolbar open while it is showing, or it vanishes under the
          // pointer as soon as the popover steals hover.
          "opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100",
          menuOpen && "opacity-100",
        )}
      >
        {onReply && (
          <Button variant="ghost" size="icon-sm" onClick={onReply} title="Reply in thread" aria-label="Reply in thread">
            <Reply className="size-3.5" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleStar}
          title={isStarred ? "Remove from starred" : "Add to starred"}
          aria-label={isStarred ? "Remove from starred" : "Add to starred"}
        >
          {isStarred ? <BookmarkCheck className="size-3.5 text-blue-500" /> : <Bookmark className="size-3.5" />}
        </Button>

        {canPin && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onTogglePin}
            title={isPinned ? "Unpin from conversation" : "Pin to conversation"}
            aria-label={isPinned ? "Unpin from conversation" : "Pin to conversation"}
          >
            {isPinned ? <PinOff className="size-3.5 text-amber-600" /> : <Pin className="size-3.5" />}
          </Button>
        )}

        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}>
            <MoreHorizontal className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-44 gap-0 p-1">
            <Button variant="ghost" size="sm" className={MENU_ITEM} onClick={handleCopyText}>
              <Copy className="size-3.5" />
              Copy text
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={MENU_ITEM}
              onClick={() => {
                setMenuOpen(false);
                onForward();
              }}
            >
              <Forward className="size-3.5" />
              Forward
            </Button>

            {/* Sender-only, and only while the thread is open. */}
            {isOwn && canModify && (
              <>
                <div className="my-1 border-t border-border" />
                <Button
                  variant="ghost"
                  size="sm"
                  className={MENU_ITEM}
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                >
                  <Pencil className="size-3.5" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(MENU_ITEM, "text-destructive hover:bg-destructive/10 hover:text-destructive")}
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Delete message?</DialogTitle>
          <DialogDescription>
            This removes it from the conversation for you and for {copy.otherSide}. It can&apos;t be undone from
            here.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmDelete(false);
                onDelete();
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
