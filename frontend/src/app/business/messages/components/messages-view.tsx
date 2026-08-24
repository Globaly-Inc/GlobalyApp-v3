"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { ChatCopyProvider } from "@/components/chat/chat-copy";
import { fetchThreads, toggleThreadFavorite } from "../store/business-messages-slice";
import { getDraftCount, getServerDraftCount, subscribeDrafts } from "@/components/chat/draft-store";
import { ChatEmptyState } from "./chat-empty-state";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ConversationView } from "./conversation-view";
import { DraftsView } from "@/components/chat/drafts-view";
import { StarredView } from "./starred-view";
import { UnreadView } from "./unread-view";
import type { ActiveView, ShortcutType } from "@/components/chat/ui-types";

/**
 * The business chat screen — the same layout as the student's at /personal/messages,
 * laid out like GlobalyOS V2's `pages/Chat.tsx`: a fixed-width
 * left rail beside a flexible main column, both filling one non-scrolling viewport
 * panel, with the whole thing collapsing to one-pane-at-a-time on mobile.
 *
 * V2 keys its layout off a `useIsMobile()` hook and renders two different trees. Here
 * one tree does both via CSS — the sidebar is `hidden` on mobile while a conversation is
 * open, and the main column is `hidden` on mobile while it is not. Same behaviour, no
 * hydration-sensitive width measurement, and it keeps the composer's draft mounted
 * across the breakpoint.
 *
 * `?thread=<distribution_id>` deep-links straight into a conversation, which is how the
 * enquiries inbox hands off.
 *
 * Threads are shared by every agent in the business, but the read cursor, favourites and
 * stars are per agent — see the backend's messages.service. So two colleagues working the
 * same lead see the same messages and their own unread badges.
 */
/**
 * The kit's three side-naming sentences, told from this side. Everything else in the kit
 * takes the counterpart's name as data and needs no wording of its own.
 */
const BUSINESS_COPY = {
  emptyInbox: "A conversation opens as soon as you unlock an enquiry from the Enquiries inbox.",
  emptyThread: "No messages yet — say hello and offer to answer their questions.",
  otherSide: "the student",
};

export function MessagesView() {
  const dispatch = useAppDispatch();
  const { threads, threadsStatus, byDistribution } = useAppSelector((s) => s.businessMessages);

  const searchParams = useSearchParams();
  // Read once at mount: the URL isn't rewritten as the selection changes, so
  // back/forward stays predictable.
  const [active, setActive] = useState<ActiveView>(() => {
    const id = searchParams.get("thread");
    return id ? { type: "conversation", id } : { type: "none" };
  });
  /**
   * A specific message to reveal once the thread has loaded — set by a search hit or a
   * Starred row. Threaded down as a prop rather than scrolled to from the click handler,
   * which is V2's `highlightMessageId` design: the conversation owns its own fetch, so
   * scrolling from here would mean fetching the thread a second time just to know when
   * the row exists.
   */
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchThreads());
  }, [dispatch]);

  const draftCount = useSyncExternalStore(subscribeDrafts, getDraftCount, getServerDraftCount);

  const openThread = useCallback((distributionId: string, messageId?: number) => {
    setActive({ type: "conversation", id: distributionId });
    setHighlightId(messageId ?? null);
  }, []);

  const selectShortcut = useCallback((type: ShortcutType) => {
    setActive({ type });
    setHighlightId(null);
  }, []);

  const backToList = useCallback(() => {
    setActive({ type: "none" });
    setHighlightId(null);
  }, []);

  // A deep link can name a thread that isn't this business's (or no longer exists); the
  // list is the authority, so an unmatched id just falls back to the welcome panel.
  const selected = active.type === "conversation" ? threads.find((t) => t.distribution_id === active.id) : undefined;

  // The list is the mobile home screen, so "nothing open" must show it, not an empty pane.
  const mainOpen = active.type !== "none" && (active.type !== "conversation" || selected !== undefined);

  // Chat wants the whole width, not the shell's centred max-w-7xl column. That comes from
  // BusinessShell's FULL_BLEED_ROUTES, which drops both the SHELL_WIDTH wrapper and
  // <main>'s padding for this route — so this box just fills what it is given.
  //
  // Emphatically NOT the `w-screen` + `mx-[calc(50%-50vw)]` trick used by earn-sub-nav:
  // that re-centres a 100vw box on its container's centre, which only lands on the
  // viewport's centre when the container is itself viewport-centred. Under this shell
  // <main> starts to the right of the w-20 nav rail, so the box came out half the rail's
  // width too far left and the sidebar hid under the rail.
  return (
    <ChatCopyProvider copy={BUSINESS_COPY}>
      <div
        className={cn(
          "flex overflow-hidden bg-background",
          // 4rem header, at every breakpoint. NOT the student's extra mobile allowance:
          // BusinessShell has no bottom nav to clear, so subtracting one would leave a dead
          // strip under the composer on phones.
          "h-[calc(100dvh-4rem)]",
        )}
      >
        <div className={cn("w-full shrink-0 md:w-72 lg:w-80", mainOpen && "hidden md:block")}>
          <ChatSidebar
            threads={threads}
            loading={threadsStatus === "loading" && threads.length === 0}
            messagesByThread={byDistribution}
            active={active}
            draftCount={draftCount}
            onOpenThread={openThread}
            onSelectShortcut={selectShortcut}
            onToggleFavorite={(id) => dispatch(toggleThreadFavorite(id))}
          />
        </div>

        <div className={cn("min-w-0 flex-1", !mainOpen && "hidden md:block")}>
          {selected ? (
            <ConversationView thread={selected} highlightMessageId={highlightId} onBack={backToList} />
          ) : active.type === "unread" ? (
            <UnreadView threads={threads} onBack={backToList} onOpen={openThread} />
          ) : active.type === "starred" ? (
            <StarredView onBack={backToList} onOpen={openThread} />
          ) : active.type === "drafts" ? (
            <DraftsView onBack={backToList} onOpen={openThread} />
          ) : (
            <ChatEmptyState threadCount={threads.length} />
          )}
          </div>
      </div>
    </ChatCopyProvider>
  );
}
