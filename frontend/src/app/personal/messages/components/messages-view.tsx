"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/hooks";
import { messagesApi } from "../apis";
import {
  fetchConversations,
  messageReceived,
  openConversation,
  sendMessage,
} from "../store/messages-slice";
import { currentUserId } from "../utils";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";

export function MessagesView() {
  const dispatch = useAppDispatch();
  const { conversations, listStatus, activeId, messages, threadStatus, sendStatus, error } = useAppSelector(
    (s) => s.messages,
  );
  const store = useAppStore();

  // The token lives in localStorage, which does not exist while rendering on the server —
  // useSyncExternalStore is the SSR-safe way to read it (null on the server, the real id on
  // the client) without a hydration mismatch. It never changes mid-session, so there is
  // nothing to subscribe to.
  const me = useSyncExternalStore(
    () => () => {},
    currentUserId,
    () => null,
  );

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchConversations());
  }, [dispatch]);

  const active = useMemo(() => conversations.find((c) => c.id === activeId), [conversations, activeId]);

  // Live thread. The cursor is the newest message already loaded — read from the store at
  // subscribe time, so a reconnect resumes where it stopped instead of replaying the
  // thread, and the subscription does not restart on every incoming frame.
  useEffect(() => {
    if (!activeId || threadStatus !== "succeeded") return;
    const controller = new AbortController();
    const since = store.getState().messages.messages.at(-1)?.id ?? 0;
    void messagesApi
      .streamConversation(
        activeId,
        since,
        (message) => dispatch(messageReceived(message)),
        controller.signal,
      )
      .catch(() => {
        // Aborted on unmount, or the stream dropped — the thread still has its history and
        // the next open re-subscribes. ponytail: add backoff-reconnect if drops get common.
      });
    return () => controller.abort();
  }, [activeId, threadStatus, dispatch, store]);

  const handleSend = useCallback(
    (content: string) => {
      if (!activeId) return;
      dispatch(sendMessage({ conversationId: activeId, content }));
    },
    [dispatch, activeId],
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-2xl border bg-card shadow-sm">
      <aside className="w-72 shrink-0 overflow-y-auto border-r bg-muted/30">
        <h1 className="border-b px-4 py-3 text-sm font-semibold">Messages</h1>
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          loading={listStatus === "loading"}
          onSelect={(id) => dispatch(openConversation(id))}
        />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {activeId ? (
          <>
            <header className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="truncate text-sm font-semibold">{active?.title ?? "Conversation"}</h2>
              {active?.status === "closed" && <span className="text-xs text-muted-foreground">Closed</span>}
            </header>
            <MessageThread
              messages={messages}
              currentUserId={me}
              loading={threadStatus === "loading"}
              sending={sendStatus === "loading"}
              disabled={active?.status === "closed"}
              onSend={handleSend}
            />
          </>
        ) : (
          <p className="m-auto text-sm text-muted-foreground">Pick a conversation to start reading.</p>
        )}
        {error && <p className="border-t px-4 py-2 text-xs text-destructive">{error}</p>}
      </section>
    </div>
  );
}
