"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { MessageThread } from "@/components/message-thread";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchDistributionMessages, sendDistributionMessage } from "../store/business-enquiries-slice";

/** How often an open thread refetches. Polling, per PRD §7.6 — v3 has no socket layer. */
const POLL_MS = 15_000;

/**
 * One business-side thread. Mounted only while its card is expanded, so the poll stops
 * when it collapses. Read-only once the enquiry is closed — mirroring the server, which
 * is the thing that actually decides.
 */
export function DistributionThread({
  distributionId,
  studentName,
  isClosed,
}: Readonly<{ distributionId: string; studentName: string; isClosed: boolean }>) {
  const dispatch = useAppDispatch();
  const messages = useAppSelector((s) => s.businessEnquiries.messagesByDistribution[distributionId]) ?? [];
  const status = useAppSelector((s) => s.businessEnquiries.messagesStatus[distributionId]) ?? "idle";

  // Strict Mode double-invokes effects (frontend/AGENTS.md), hence the guard on the
  // first fetch. The interval is separate and cleans itself up on collapse/unmount.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      dispatch(fetchDistributionMessages(distributionId));
    }
    if (isClosed) return; // nothing new can arrive on a closed thread
    const timer = setInterval(() => dispatch(fetchDistributionMessages(distributionId)), POLL_MS);
    return () => clearInterval(timer);
  }, [dispatch, distributionId, isClosed]);

  const handleSend = async (body: string): Promise<boolean> => {
    const result = await dispatch(sendDistributionMessage({ distributionId, body }));
    if (sendDistributionMessage.rejected.match(result)) {
      toast.error("Couldn't send", {
        description: (result.payload as string) ?? "Please try again.",
      });
      return false;
    }
    return true;
  };

  return (
    <MessageThread
      messages={messages}
      status={status}
      counterpartyName={studentName}
      composerState={isClosed ? "closed" : "open"}
      hint="This enquiry is closed. The conversation stays readable, but no new messages can be sent."
      emptyText={`No messages yet — say hello to ${studentName}.`}
      onSend={handleSend}
    />
  );
}
