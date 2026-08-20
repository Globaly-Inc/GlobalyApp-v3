"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageThread, type ComposerState } from "@/components/message-thread";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchMessages, sendMessage } from "../store/my-services-slice";
import type { OrderStatus } from "../apis/types";

/** Statuses whose thread is read-only. Mirrors the server, which is the thing that actually decides. */
const CLOSED: OrderStatus[] = ["cancelled", "refunded"];

/**
 * The order conversation — what a buyer and seller do after a purchase.
 *
 * It is scoped to one order rather than being an inbox: there is no messaging module in
 * V3, and a thread that already knows both participants needs no contact list.
 *
 * The bubbles and composer live in @/components/message-thread, shared with the enquiry
 * chat. This wrapper keeps what is specific to orders: the store wiring and which
 * statuses make the thread unusable.
 */
export function OrderThread({
  orderId,
  status,
  counterpartyName,
}: Readonly<{ orderId: number; status: OrderStatus; counterpartyName: string }>) {
  const dispatch = useAppDispatch();
  const { messages, messagesStatus } = useAppSelector((state) => state.myServices);

  // Strict Mode double-invokes effects; without the guard this fetches twice on every mount
  // (frontend/AGENTS.md).
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchMessages(orderId));
  }, [dispatch, orderId]);

  const notYet = status === "pending_payment";
  const closed = CLOSED.includes(status);
  const composerState: ComposerState = notYet ? "locked" : closed ? "closed" : "open";

  const handleSend = async (body: string): Promise<boolean> => {
    const result = await dispatch(sendMessage({ orderId, body }));
    if (sendMessage.rejected.match(result)) {
      toast.error("Couldn't send", { description: result.error.message ?? "Please try again." });
      return false;
    }
    return true;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Messages</CardTitle>
        <p className="text-sm text-muted-foreground">
          {notYet
            ? "You can message once the payment has gone through."
            : `Sort out the details with ${counterpartyName} here.`}
        </p>
      </CardHeader>
      <CardContent>
        <MessageThread
          messages={messages}
          status={messagesStatus}
          counterpartyName={counterpartyName}
          composerState={composerState}
          hint={
            notYet
              ? "Nothing to discuss until the payment clears."
              : `This order is ${status}. The conversation stays readable, but no new messages can be sent.`
          }
          emptyText={notYet ? "Nothing here yet." : "No messages yet — say hello and agree the details."}
          onSend={handleSend}
        />
      </CardContent>
    </Card>
  );
}
