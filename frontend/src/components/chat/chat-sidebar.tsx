"use client";

import { useMemo } from "react";
import { ChatSearch } from "./chat-search";
import { ConversationList } from "./conversation-list";
import { FavoritesSection } from "./favorites-section";
import { ShortcutsNav } from "./shortcuts-nav";
import type { EnquiryMessage, ChatThread } from "./types";
import type { ActiveView, ShortcutType } from "./ui-types";

/**
 * The left rail — GlobalyOS V2's `ChatSidebar` structure top to bottom: search, then
 * SHORTCUTS, then FAVORITES, then the conversation list, each separated by a hairline,
 * the whole column scrolling below a fixed search field.
 *
 * V2's header row above the search (bell / + / "New chat") is deliberately absent: every
 * button in it creates something — a DM, a space, a group — and none of those exist on
 * the student side, where a conversation only comes into being when a business unlocks
 * an enquiry.
 */
export function ChatSidebar({
  threads,
  loading,
  messagesByThread,
  active,
  draftCount,
  onOpenThread,
  onSelectShortcut,
  onToggleFavorite,
}: Readonly<{
  threads: ChatThread[];
  loading: boolean;
  messagesByThread: Record<string, EnquiryMessage[]>;
  active: ActiveView;
  draftCount: number;
  onOpenThread: (distributionId: string, messageId?: number) => void;
  onSelectShortcut: (type: ShortcutType) => void;
  onToggleFavorite: (distributionId: string) => void;
}>) {
  const favorites = useMemo(() => threads.filter((t) => t.is_favorite), [threads]);

  // V2's sortedConversations: unread first, then newest activity.
  const sorted = useMemo(
    () =>
      [...threads].sort((a, b) => {
        const unreadDelta = Number(b.unread_count > 0) - Number(a.unread_count > 0);
        if (unreadDelta !== 0) return unreadDelta;
        return (b.last_message_at ?? b.unlocked_at).localeCompare(a.last_message_at ?? a.unlocked_at);
      }),
    [threads],
  );

  const unreadTotal = useMemo(() => threads.reduce((sum, t) => sum + t.unread_count, 0), [threads]);

  return (
    <div className="flex h-full flex-col border-border bg-card md:border-r">
      <div className="shrink-0 p-3">
        <ChatSearch threads={threads} messagesByThread={messagesByThread} onOpenThread={onOpenThread} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ShortcutsNav
          active={active}
          unreadCount={unreadTotal}
          draftCount={draftCount}
          onSelect={onSelectShortcut}
        />

        <div className="mx-3 h-px bg-border" />

        <FavoritesSection
          favorites={favorites}
          active={active}
          onOpen={onOpenThread}
          onToggleFavorite={onToggleFavorite}
        />

        {favorites.length > 0 && <div className="mx-3 h-px bg-border" />}

        <ConversationList
          threads={sorted}
          loading={loading}
          active={active}
          onOpen={onOpenThread}
          onToggleFavorite={onToggleFavorite}
        />
      </div>
    </div>
  );
}
