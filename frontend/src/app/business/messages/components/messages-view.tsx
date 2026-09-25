"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { ChatCopyProvider } from "@/components/chat/chat-copy";
import { fetchThreads, toggleThreadFavorite } from "../store/business-messages-slice";
import { fetchEmbedChats } from "../store/embed-chats-slice";
import { EmbedConversationView } from "./embed-conversation-view";
import { InboxListSidebar } from "./inbox-list-sidebar";
import { InboxKindTabs, type InboxKind } from "./inbox-kind-tabs";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
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
  const embed = useAppSelector((s) => s.embedChats);
  /** Which list the rail shows. All merges enquiry threads and AI conversations. */
  const [kind, setKind] = useState<InboxKind>("all");
  /**
   * Which side the main column shows on the All tab, which can open either. The other two
   * tabs always show their own side; each side keeps its own selection across a tab switch,
   * so returning to All brings back whatever All last had open.
   */
  const [allPane, setAllPane] = useState<"enquiry" | "embed">("enquiry");
  const pane = kind === "all" ? allPane : kind;
  /**
   * The open AI conversation — the row itself, not just its id. The loaded list is a search
   * result and a set of pages, so the open visitor can drop out of it; looking it up there
   * would blank the pane mid-read. A fresher copy from the list still wins when present.
   */
  const [embedOpen, setEmbedOpen] = useState<WidgetVisitor | null>(null);

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
    // At mount, not on first switch: the All tab (the default) and every tab's count need it.
    dispatch(fetchEmbedChats());
  }, [dispatch]);

  // Only a server round-trip when the term really changed — the sidebar's debounce fires on
  // mount and on every remount (a tab switch), with the term the list already reflects.
  const searchVisitors = useCallback(
    (term: string) => {
      if (term !== embed.search) dispatch(fetchEmbedChats({ search: term }));
    },
    [dispatch, embed.search],
  );
  const loadMoreVisitors = () => dispatch(fetchEmbedChats({ page: embed.page + 1, search: embed.search }));

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
  const enquiryOpen = active.type !== "none" && (active.type !== "conversation" || selected !== undefined);
  const embedSelected = embedOpen ? (embed.visitors.find((v) => v.id === embedOpen.id) ?? embedOpen) : undefined;
  const mainOpen = pane === "enquiry" ? enquiryOpen : embedSelected !== undefined;
  const counts = { all: threads.length + embed.total, enquiry: threads.length, embed: embed.total };
  const tabs = <InboxKindTabs value={kind} onChange={setKind} counts={counts} />;

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
        <div className={cn("w-full shrink-0 md:w-80 lg:w-[22rem]", mainOpen && "hidden md:block")}>
          {kind !== "enquiry" ? (
            <InboxListSidebar
              header={tabs}
              threads={kind === "all" ? threads : []}
              visitors={embed.visitors}
              messagesByThread={byDistribution}
              hasMore={embed.visitors.length < embed.matched}
              loadingMore={embed.status === "loading" && embed.visitors.length > 0}
              onSearchVisitors={searchVisitors}
              onLoadMore={loadMoreVisitors}
              loading={
                (embed.status === "loading" && embed.visitors.length === 0) ||
                (kind === "all" && threadsStatus === "loading" && threads.length === 0)
              }
              activeThreadId={pane === "enquiry" && active.type === "conversation" ? active.id : null}
              activeVisitorId={pane === "embed" ? (embedOpen?.id ?? null) : null}
              onOpenThread={(id, messageId) => {
                openThread(id, messageId);
                if (kind === "all") setAllPane("enquiry");
              }}
              onOpenVisitor={(id) => {
                setEmbedOpen(embed.visitors.find((v) => v.id === id) ?? null);
                if (kind === "all") setAllPane("embed");
              }}
              onToggleFavorite={(id) => dispatch(toggleThreadFavorite(id))}
            />
          ) : (
            <ChatSidebar
              header={tabs}
              searchPlaceholder="Search by name, programme or message"
              threads={threads}
              loading={threadsStatus === "loading" && threads.length === 0}
              messagesByThread={byDistribution}
              active={active}
              draftCount={draftCount}
              onOpenThread={openThread}
              onSelectShortcut={selectShortcut}
              onToggleFavorite={(id) => dispatch(toggleThreadFavorite(id))}
            />
          )}
        </div>

        <div className={cn("min-w-0 flex-1", !mainOpen && "hidden md:block")}>
          {pane === "embed" ? (
            embedSelected ? (
              <EmbedConversationView visitor={embedSelected} onBack={() => setEmbedOpen(null)} />
            ) : (
              <ChatEmptyState threadCount={embed.visitors.length} embed />
            )
          ) : selected ? (
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
