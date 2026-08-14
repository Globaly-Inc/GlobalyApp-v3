"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { servicesApi } from "../apis";
import type { BookingDetails, Order } from "../apis";

/**
 * The booking request itself: what the buyer asked for, and — for the provider — the decision.
 *
 * Shown to both parties because the buyer should be able to re-read what they submitted, and because a
 * declined booking has to show its reason to the person it was refused to. Only the provider gets buttons.
 *
 * The answers arrive already paired with their labels: the stored keys are meaningless on their own, and the
 * labels live in schema_fields, so the server does the pairing at read time rather than shipping a second
 * request to resolve them.
 */
export function BookingPanel({
  order,
  onOrderChange,
}: Readonly<{ order: Order; onOrderChange: (order: Order) => void }>) {
  const [details, setDetails] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");

  // Strict Mode double-invokes effects (frontend/AGENTS.md).
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    servicesApi
      .getBooking(order.id)
      .then(setDetails)
      .catch(() => setDetails(null))
      .finally(() => setLoading(false));
  }, [order.id]);

  const isProvider = order.role === "provider";
  const awaitingDecision = order.status === "requested";

  const run = async (fn: () => Promise<Order>, success: string, failure: string) => {
    setActing(true);
    try {
      const updated = await fn();
      onOrderChange(updated);
      toast.success(success);
      return true;
    } catch (err) {
      toast.error(failure, { description: err instanceof Error ? err.message : "Please try again." });
      return false;
    } finally {
      setActing(false);
    }
  };

  const decline = async () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    const ok = await run(
      () => servicesApi.declineBooking(order.id, trimmed),
      "Booking declined",
      "Couldn't decline",
    );
    if (ok) {
      setDeclineOpen(false);
      setDetails((d) => (d ? { ...d, decline_reason: trimmed } : d));
    }
  };

  const hasAnswers = (details?.answers.length ?? 0) > 0;
  // Nothing to show and nothing to decide — a card saying "no details" is worse than no card.
  if (!loading && !hasAnswers && !details?.note && !details?.decline_reason && !awaitingDecision) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Booking request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {hasAnswers && (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  {details!.answers.map((a) => (
                    <div key={a.key}>
                      <dt className="text-xs text-muted-foreground">{a.label}</dt>
                      <dd className="font-medium text-foreground">{a.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {details?.note && (
                <div className="rounded-md border border-border bg-muted/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground">From the buyer</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{details.note}</p>
                </div>
              )}

              {!hasAnswers && !details?.note && awaitingDecision && (
                <p className="text-sm text-muted-foreground">
                  This service doesn&apos;t ask for any details up front.
                </p>
              )}

              {/* The reason leads for a declined booking — it is the only actionable thing on the page. */}
              {order.status === "declined" && details?.decline_reason && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-xs font-medium text-destructive">Why it was declined</p>
                  <p className="text-sm text-foreground">{details.decline_reason}</p>
                </div>
              )}

              {isProvider && awaitingDecision && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    onClick={() =>
                      run(
                        () => servicesApi.acceptBooking(order.id),
                        "Booking accepted — the buyer has been asked to pay",
                        "Couldn't accept",
                      )
                    }
                    disabled={acting}
                  >
                    <Check data-icon="inline-start" />
                    Accept
                  </Button>
                  <Button variant="outline" onClick={() => setDeclineOpen(true)} disabled={acting}>
                    <X data-icon="inline-start" />
                    Decline
                  </Button>
                </div>
              )}

              {!isProvider && awaitingDecision && (
                <p className="text-xs text-muted-foreground">
                  Waiting for the provider to accept. You&apos;ll be emailed either way, and nothing is charged
                  until you confirm.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline this booking</DialogTitle>
            <DialogDescription>
              The buyer sees this, so say enough for them to try again elsewhere or at another time. They have
              not been charged.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={reason}
            placeholder="I'm away that week — try the weekend after."
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineOpen(false)} disabled={acting}>
              Cancel
            </Button>
            {/* Disabled until there is a reason, so the 400 the server would return is never reached. */}
            <Button variant="destructive" onClick={decline} disabled={acting || !reason.trim()}>
              {acting ? "Declining…" : "Decline booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
