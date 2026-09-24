"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  Check,
  ClipboardCopy,
  ExternalLink,
  LoaderCircle,
  LogOut,
  MoreHorizontal,
  Pencil,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { conversationToText, copyToClipboard, initials, threadTitle, threadAvatar } from "./utils";
import type { EnquiryMessage, ChatThread } from "./types";

/**
 * The inline rename, as GlobalyOS does it: the heading turns into a field with a tick and a cross,
 * rather than opening a dialog for one string.
 *
 * Submitting empty CLEARS the name (null) rather than saving "", so the thread falls back to each
 * side's default label. Enter saves, Escape cancels — the same keys the composer uses.
 */
function ThreadTitleInput({
  initial,
  onSave,
  onCancel,
}: Readonly<{ initial: string; onSave: (title: string | null) => Promise<void>; onCancel: () => void }>) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(value.trim() || null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        value={value}
        disabled={saving}
        maxLength={100}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") onCancel();
        }}
        aria-label="Conversation name"
        className="h-8 text-base font-semibold"
      />
      <Button variant="ghost" size="icon-sm" aria-label="Save name" disabled={saving} onClick={() => void save()}>
        <Check className="size-4" />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Cancel rename" disabled={saving} onClick={onCancel}>
        <X className="size-4" />
      </Button>
    </div>
  );
}

/**
 * The conversation top bar — GlobalyOS V2's `ChatHeader`, trimmed to what a two-party
 * enquiry thread has: avatar, name, a metadata line, and the right-hand icon rail.
 *
 * Kept from V2: the favorite star (same orange fill) and the overflow menu.
 * Dropped: mute, search-in-conversation, space settings, group rename/photo, video call.
 * Added: **Copy complete chat** — V2 only copies one message at a time
 * (MessageActionsToolbar's "Copy text"), so this is the same action widened to the whole
 * thread and placed in the same overflow-menu idiom.
 */
export function ConversationHeader({
  thread,
  messages,
  enquiryHref,
  onBack,
  onToggleFavorite,
  onLeave,
  onRename,
  onChangePhoto,
}: Readonly<{
  thread: ChatThread;
  messages: EnquiryMessage[];
  /**
   * Where "View enquiry" goes. Injected because the two sides file the same enquiry under
   * different routes — the student has a detail page per enquiry, the business has its
   * inbox. Null hides the item rather than linking somewhere that 404s.
   */
  enquiryHref: string | null;
  onBack: () => void;
  onToggleFavorite: () => void;
  /**
   * Opens the leave confirmation. Omitted where leaving is not on offer — the student side passes
   * it only once the enquiry is closed, because until then there is nothing they are allowed to do
   * and an item that always errors is worse than no item. The business's Leave lives in the
   * members panel instead, next to the roster it depends on.
   */
  onLeave?: () => void;
  /**
   * Saves a new name for the thread, or null to clear it. Omitted for anyone who may not rename —
   * the student always, and any agent who is not the thread's admin — which is what hides the
   * pencil. The endpoint refuses them regardless.
   */
  onRename?: (title: string | null) => Promise<void>;
  /**
   * Uploads and applies a new conversation photo. Same gate as onRename — thread admins only — and
   * omitting it is what leaves the avatar a plain avatar for everyone else.
   */
  onChangePhoto?: (file: File) => Promise<void>;
}>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const title = threadTitle(thread);
  const avatar = threadAvatar(thread);
  const [photoBusy, setPhotoBusy] = useState(false);

  const handleCopyConversation = async () => {
    setMenuOpen(false);
    if (messages.length === 0) {
      toast.error("Nothing to copy yet");
      return;
    }
    if (await copyToClipboard(conversationToText(thread, messages))) {
      toast.success(`Copied ${messages.length} message${messages.length === 1 ? "" : "s"} to clipboard`);
    } else {
      toast.error("Couldn't copy the conversation");
    }
  };

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 py-2.5 md:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
        {/* Back is the only way out of a conversation on mobile, where the sidebar is
            replaced rather than sitting alongside. */}
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft />
        </Button>

        {/* GlobalyOS puts the picker on the avatar itself: hover reveals a camera over it. Wrapped
            in a label rather than a button so the hidden file input opens with one click and stays
            keyboard-reachable. Non-admins get the plain avatar. */}
        {onChangePhoto ? (
          <label className="group relative shrink-0 cursor-pointer" aria-label="Change conversation photo">
            <Avatar className="size-9">
              {avatar && <AvatarImage src={avatar} alt={title} />}
              <AvatarFallback className="bg-primary/10 text-xs text-primary">{initials(title)}</AvatarFallback>
            </Avatar>
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              {photoBusy ? (
                <LoaderCircle className="size-4 animate-spin text-white" aria-hidden />
              ) : (
                <Camera className="size-4 text-white" aria-hidden />
              )}
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={photoBusy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                // Reset first: picking the same file twice must fire change both times.
                e.target.value = "";
                if (!file) return;
                setPhotoBusy(true);
                try {
                  await onChangePhoto(file);
                } catch (err) {
                  toast.error((err as Error).message);
                } finally {
                  setPhotoBusy(false);
                }
              }}
            />
          </label>
        ) : (
          <Avatar className="size-9 shrink-0">
            {avatar && <AvatarImage src={avatar} alt={title} />}
            <AvatarFallback className="bg-primary/10 text-xs text-primary">{initials(title)}</AvatarFallback>
          </Avatar>
        )}

        <div className="min-w-0">
          {renaming ? (
            <ThreadTitleInput
              initial={thread.title ?? ""}
              onCancel={() => setRenaming(false)}
              onSave={async (next) => {
                await onRename!(next);
                setRenaming(false);
              }}
            />
          ) : (
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
            {onRename && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground"
                aria-label="Rename conversation"
                onClick={() => setRenaming(true)}
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
            {thread.is_closed && (
              <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Closed
              </span>
            )}
          </div>
          )}
          <p className="truncate text-xs text-muted-foreground">{thread.course_name}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={onToggleFavorite}
          title={thread.is_favorite ? "Remove from favorites" : "Add to favorites"}
          aria-label={thread.is_favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={cn("size-4", thread.is_favorite && "fill-orange-500 text-orange-500")} />
        </Button>

        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Conversation actions" />}>
            <MoreHorizontal className="size-4" />
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" className="w-56 gap-0 p-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start gap-2"
              onClick={handleCopyConversation}
            >
              <ClipboardCopy className="size-3.5" />
              Copy complete chat
            </Button>
            {enquiryHref && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start gap-2"
                render={<Link href={enquiryHref} />}
                onClick={() => setMenuOpen(false)}
              >
                <ExternalLink className="size-3.5" />
                View enquiry
              </Button>
            )}
            {onLeave && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start gap-2 text-destructive hover:text-destructive"
                onClick={() => {
                  setMenuOpen(false);
                  onLeave();
                }}
              >
                <LogOut className="size-3.5" />
                Leave conversation
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
