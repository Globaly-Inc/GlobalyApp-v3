"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MessageThread } from "@/components/message-thread";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchThreadMessages, sendThreadMessage } from "../store/messages-slice";
import type { MessageThreadSummary } from "../apis/types";

/** How often an open thread refetches. Polling, per PRD §7.6 — v3 has no socket layer. */
const POLL_MS = 15_000;

/**
 * The full-height chat view: header, scrolling history, composer pinned to the bottom.
 * Mounted only while a thread is selected, so the poll stops the moment it closes.
 */
export function ChatWindow({ thread, onBack }: Readonly<{ thread: MessageThreadSummary; onBack: () => void }>) {
  const dispatch = useAppDispatch();
  const id = thread.distribution_id;
  const messages = useAppSelector((s) => s.messages.byDistribution[id]) ?? [];
  const status = useAppSelector((s) => s.messages.status[id]) ?? "idle";

  // Strict Mode double-invokes effects, hence the guard on the first fetch. The interval is
  // separate and cleans itself up when the thread is closed.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      dispatch(fetchThreadMessages(id));
    }
    if (thread.is_closed) return; // nothing new can arrive on a closed thread
    const timer = setInterval(() => dispatch(fetchThreadMessages(id)), POLL_MS);
    return () => clearInterval(timer);
  }, [dispatch, id, thread.is_closed]);

  const handleSend = async (body: string): Promise<boolean> => {
    const result = await dispatch(sendThreadMessage({ distributionId: id, body }));
    if (sendThreadMessage.rejected.match(result)) {
      toast.error("Couldn't send", { description: result.error.message ?? "Please try again." });
      return false;
    }
    return true;
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col rounded-xl border bg-background">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{thread.business_name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {thread.is_closed ? "Closed" : "Active"} · {thread.course_name}
          </p>
        </div>
        <Button variant="ghost" size="sm" render={<Link href={`/personal/enquiries/${thread.enquiry_id}`} />}>
          View enquiry
          <ExternalLink data-icon="inline-end" />
        </Button>
      </div>

      <MessageThread
        layout="fill"
        messages={messages}
        status={status}
        counterpartyName={thread.business_name}
        composerState={thread.is_closed ? "closed" : "open"}
        hint={`${thread.business_name} closed this enquiry. The conversation stays readable, but no new messages can be sent.`}
        emptyText={`No messages yet — say hello to ${thread.business_name}.`}
        onSend={handleSend}
      />
    </div>
  );
}
