"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { STATUS_EXPLANATIONS, STATUS_LABELS, STATUS_STYLES } from "../const";
import { formatDate, formatMoney } from "../utils";
import {
  cancelOrder,
  clearOrder,
  confirmCompletion,
  disputeOrder,
  fetchOrder,
  fetchReview,
  refundOrder,
} from "../store/my-services-slice";
import { ReviewForm, SubmittedReview } from "./review-form";
import { SectionError } from "./section-error";

export function OrderDetailView({ orderId }: Readonly<{ orderId: number }>) {
  const dispatch = useAppDispatch();
  const { order, orderStatus, orderError, review, acting } = useAppSelector((state) => state.myServices);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchOrder(orderId));
    dispatch(fetchReview(orderId));
    return () => {
      dispatch(clearOrder());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (orderStatus === "loading" || (!order && orderStatus === "idle")) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (orderStatus === "failed" || !order) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <BackLink />
        <SectionError message={orderError ?? "Order not found."} onRetry={() => dispatch(fetchOrder(orderId))} />
      </div>
    );
  }

  const isBuyer = order.role === "buyer";
  const held = order.status === "paid";

  const act = async (
    thunk: typeof confirmCompletion | typeof cancelOrder | typeof refundOrder,
    labels: { success: string; description?: string; failure: string },
  ) => {
    const result = await dispatch(thunk(orderId));
    if (thunk.rejected.match(result)) {
      toast.error(labels.failure, { description: result.error.message ?? "Please try again." });
      return false;
    }
    toast.success(labels.success, { description: labels.description });
    return true;
  };

  const handleConfirm = async () => {
    const result = await dispatch(confirmCompletion(orderId));
    if (confirmCompletion.rejected.match(result)) {
      toast.error("Couldn't confirm completion", { description: result.error.message ?? "Please try again." });
      return;
    }
    // The message depends on whether this closed the order or is still waiting on the other side.
    toast.success(
      result.payload.status === "completed" ? "Order completed" : "Confirmation recorded",
      {
        description:
          result.payload.status === "completed"
            ? "Both parties have confirmed."
            : `Waiting for the ${isBuyer ? "provider" : "buyer"} to confirm.`,
      },
    );
  };

  const handleDispute = async () => {
    if (!reason.trim()) return;
    const result = await dispatch(disputeOrder({ orderId, reason: reason.trim() }));
    if (disputeOrder.rejected.match(result)) {
      toast.error("Couldn't report the problem", { description: result.error.message ?? "Please try again." });
      return;
    }
    setDisputeOpen(false);
    setReason("");
    toast.success("Problem reported", { description: "Our team will look into this order." });
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <BackLink />

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="truncate">{order.listing_title}</CardTitle>
            {/* Role is decided server-side and stated, so neither party has to work out which side they are on. */}
            <p className="text-sm text-muted-foreground">
              You are the <strong className="text-foreground">{order.role}</strong> · {order.counterparty_name}
            </p>
          </div>
          <Badge variant="secondary" className={cn("shrink-0", STATUS_STYLES[order.status])}>
            {STATUS_LABELS[order.status]}
          </Badge>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{STATUS_EXPLANATIONS[order.status]}</p>

          {order.listing_deleted && (
            <p className="text-xs text-muted-foreground">
              This listing has since been removed. Your order and its history are unaffected.
            </p>
          )}

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Detail label="Amount">{formatMoney(order.amount_minor, order.currency)}</Detail>
            <Detail label="Created">{formatDate(order.created_at)}</Detail>
            {order.paid_at && <Detail label="Paid">{formatDate(order.paid_at)}</Detail>}
            {order.completed_at && <Detail label="Completed">{formatDate(order.completed_at)}</Detail>}
            {order.refunded_at && <Detail label="Refunded">{formatDate(order.refunded_at)}</Detail>}
            {order.cancelled_at && <Detail label="Cancelled">{formatDate(order.cancelled_at)}</Detail>}
          </dl>

          {order.notes && (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap text-sm text-foreground">{order.notes}</p>
            </div>
          )}

          {held && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium text-foreground">Completion</p>
              {/* Both rows, always, independently — so who is outstanding is never ambiguous. */}
              <ConfirmRow label="Buyer" confirmed={order.buyer_confirmed} you={isBuyer} />
              <ConfirmRow label="Provider" confirmed={order.provider_confirmed} you={!isBuyer} />
              <p className="pt-1 text-xs text-muted-foreground">
                This order closes when both parties confirm. The payment is held until then.
              </p>
            </div>
          )}

          {order.payment_refund_id && (
            <p className="text-xs text-muted-foreground">Refund reference: {order.payment_refund_id}</p>
          )}

          {/* Shown only to the party who still owes a confirmation — the server decides that flag. */}
          {order.awaiting_my_confirmation && (
            <Button className="w-full" onClick={handleConfirm} disabled={acting}>
              {acting ? "Confirming…" : "Mark as Completed"}
            </Button>
          )}

          {held && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setDisputeOpen(true)} disabled={acting}>
                <AlertTriangle />
                Report a problem
              </Button>
              {!isBuyer && (
                <Button variant="outline" size="sm" onClick={() => setRefundOpen(true)} disabled={acting}>
                  Refund this order
                </Button>
              )}
            </div>
          )}

          {order.status === "pending_payment" && (
            <Button
              variant="outline"
              className="w-full"
              disabled={acting}
              onClick={() =>
                act(cancelOrder, { success: "Order cancelled", failure: "Couldn't cancel the order" })
              }
            >
              {acting ? "Cancelling…" : "Cancel this order"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Buyer-only, completed-only, once. can_review comes from the server. */}
      {order.can_review && <ReviewForm orderId={orderId} />}
      {review && <SubmittedReview review={review} />}

      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report a problem</DialogTitle>
            <DialogDescription>
              Tell us what went wrong. The payment stays held and our team reviews the order — no further action
              is available here until they do.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={reason}
            placeholder="What happened?"
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeOpen(false)} disabled={acting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDispute} disabled={acting || !reason.trim()}>
              {acting ? "Reporting…" : "Report problem"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Refund this order?</DialogTitle>
            <DialogDescription>
              {formatMoney(order.amount_minor, order.currency)} goes back to {order.counterparty_name}. This
              cannot be undone, and the order closes as refunded.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)} disabled={acting}>
              Keep the order
            </Button>
            <Button
              variant="destructive"
              disabled={acting}
              onClick={async () => {
                const ok = await act(refundOrder, {
                  success: "Order refunded",
                  description: "The buyer has been refunded.",
                  failure: "Couldn't refund the order",
                });
                if (ok) setRefundOpen(false);
              }}
            >
              {acting ? "Refunding…" : "Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

function ConfirmRow({
  label,
  confirmed,
  you,
}: Readonly<{ label: string; confirmed: boolean; you: boolean }>) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {confirmed ? (
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className={confirmed ? "text-foreground" : "text-muted-foreground"}>
        {label}
        {you ? " (you)" : ""} {confirmed ? "confirmed" : "pending"}
      </span>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/personal/services"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to Services
    </Link>
  );
}
