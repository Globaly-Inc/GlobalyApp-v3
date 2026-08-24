"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardCopy, ExternalLink, MoreHorizontal, Star } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { conversationToText, copyToClipboard, initials } from "./utils";
import type { EnquiryMessage, ChatThread } from "./types";

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
}>) {
  const [menuOpen, setMenuOpen] = useState(false);

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

        <Avatar className="size-9 shrink-0">
          {thread.counterpart_avatar && <AvatarImage src={thread.counterpart_avatar} alt={thread.counterpart_name} />}
          <AvatarFallback className="bg-primary/10 text-xs text-primary">
            {initials(thread.counterpart_name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-base font-semibold text-foreground">{thread.counterpart_name}</h2>
            {thread.is_closed && (
              <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Closed
              </span>
            )}
          </div>
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
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
