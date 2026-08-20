"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchThreads } from "../store/messages-slice";
import { ChatWindow } from "./chat-window";
import { ThreadList } from "./thread-list";

/**
 * The student's chat inbox. One screen with two states — list, or one open conversation —
 * rather than two routes, matching how the same screen worked in v2.
 *
 * `?thread=<distribution_id>` deep-links straight into a conversation, which is how the
 * enquiry detail page hands off. Read once at mount: the URL isn't rewritten as the
 * selection changes, so back/forward stays predictable.
 */
export function MessagesView() {
  const dispatch = useAppDispatch();
  const { threads, threadsStatus } = useAppSelector((s) => s.messages);

  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState(() => searchParams.get("thread"));

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchThreads());
  }, [dispatch]);

  // A deep link can name a thread that isn't the student's (or no longer exists); the list
  // is the authority, so an unmatched id just falls back to the list.
  const selected = threads.find((t) => t.distribution_id === selectedId);

  if (selected) {
    return <ChatWindow thread={selected} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="space-y-4 md:space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your conversations with agents and institutions.</p>
      </div>

      <ThreadList
        threads={threads}
        loading={threadsStatus === "loading" && threads.length === 0}
        onOpen={setSelectedId}
      />
    </div>
  );
}
