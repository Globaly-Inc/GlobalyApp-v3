"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { formatDate } from "../utils";
import { fetchMessages, sendMessage } from "../store/my-services-slice";
import type { OrderStatus } from "../apis/types";

/** Statuses whose thread is read-only. Mirrors the server, which is the thing that actually decides. */
const CLOSED: OrderStatus[] = ["cancelled", "refunded"];

/**
 * The order conversation — what a buyer and seller do after a purchase.
 *
 * This replaced dual confirmation. It is scoped to one order rather than being an inbox: there is no
 * messaging module in V3, and a thread that already knows both participants needs no contact list.
 */
export function OrderThread({
  orderId,
  status,
  counterpartyName,
}: Readonly<{ orderId: number; status: OrderStatus; counterpartyName: string }>) {
  const dispatch = useAppDispatch();
  const { messages, messagesStatus } = useAppSelector((state) => state.myServices);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

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

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    const result = await dispatch(sendMessage({ orderId, body: trimmed }));
    setSending(false);
    if (sendMessage.rejected.match(result)) {
      toast.error("Couldn't send", { description: result.error.message ?? "Please try again." });
      return;
    }
    // Cleared only on success, so a failed send does not lose what the person typed.
    setBody("");
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
      <CardContent className="space-y-3">
        {messagesStatus === "loading" && (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        )}

        {messagesStatus === "failed" && (
          <p className="py-4 text-center text-sm text-destructive">Couldn&apos;t load the conversation.</p>
        )}

        {messagesStatus === "idle" && messages.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            {notYet ? "Nothing here yet." : "No messages yet — say hello and agree the details."}
          </p>
        )}

        {messages.length > 0 && (
          <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex", m.is_mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2",
                    m.is_mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                >
                  {/* The sender's own name is redundant on their own bubble. */}
                  {!m.is_mine && <p className="text-xs font-medium opacity-80">{m.sender_name}</p>}
                  <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                  <p className={cn("mt-1 text-[11px]", m.is_mine ? "opacity-70" : "text-muted-foreground")}>
                    {formatDate(m.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {closed ? (
          <p className="text-xs text-muted-foreground">
            This order is {status}. The conversation stays readable, but no new messages can be sent.
          </p>
        ) : (
          !notYet && (
            <div className="flex flex-col gap-2">
              <Textarea
                rows={3}
                value={body}
                placeholder={`Message ${counterpartyName}…`}
                onChange={(e) => setBody(e.target.value)}
                disabled={sending}
              />
              <Button className="self-end" onClick={handleSend} disabled={sending || !body.trim()}>
                {sending ? "Sending…" : "Send"}
                <Send data-icon="inline-end" />
              </Button>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
