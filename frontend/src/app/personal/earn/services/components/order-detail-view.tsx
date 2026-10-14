"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BackButton } from "@/components/ui/back-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { STATUS_EXPLANATIONS, STATUS_LABELS, STATUS_VARIANT } from "../const";
import { formatMoney } from "../utils";
import {
  cancelOrder,
  clearOrder,
  disputeOrder,
  fetchOrder,
  refundOrder,
  replaceOrderLocally,
} from "../store/my-services-slice";
import { OrderThread } from "./order-thread";
import { BookingPanel } from "./booking-panel";
import { SellerWorkActions } from "./seller-work-actions";
import { OrderSummaryCard } from "./order-summary-card";
import { SectionError } from "./section-error";

const LIST_HREF = "/personal/earn/services";

export function OrderDetailView({ orderId }: Readonly<{ orderId: number }>) {
  const dispatch = useAppDispatch();
  const { order, orderStatus, orderError, acting } = useAppSelector((state) => state.myServices);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchOrder(orderId));
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
      <PageBody>
        <BackLink />
        <SectionError message={orderError ?? "Order not found."} onRetry={() => dispatch(fetchOrder(orderId))} />
      </PageBody>
    );
  }

  const isBuyer = order.role === "buyer";
  const held = order.status === "paid";
  // Paid work has money committed against it, whether or not the seller has marked it started.
  const working = order.status === "paid" || order.status === "in_progress";

  const act = async (
    thunk: typeof cancelOrder | typeof refundOrder,
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
    <PageBody>
      <PageHeader
        leading={<BackButton href={LIST_HREF} label="Back to Services" />}
        title={order.listing_title}
        badges={<Badge variant={STATUS_VARIANT[order.status]}>{STATUS_LABELS[order.status]}</Badge>}
        subtitle={STATUS_EXPLANATIONS[order.status]}
      >
        {held && (
          <>
            <Button variant="outline" onClick={() => setDisputeOpen(true)} disabled={acting}>
              <AlertTriangle />
              Report a problem
            </Button>
            {!isBuyer && (
              <Button variant="outline" onClick={() => setRefundOpen(true)} disabled={acting}>
                Refund this order
              </Button>
            )}
          </>
        )}
        {order.status === "pending_payment" && (
          <Button
            variant="outline"
            disabled={acting}
            onClick={() => act(cancelOrder, { success: "Order cancelled", failure: "Couldn't cancel the order" })}
          >
            {acting ? "Cancelling…" : "Cancel this order"}
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          {/* What the buyer asked for, and — for the provider — Accept / Decline. */}
          <BookingPanel order={order} onOrderChange={(o) => dispatch(replaceOrderLocally(o))} />

          {/* The provider drives the work forward once it is paid for. */}
          {working && order.role === "provider" && (
            <SellerWorkActions order={order} onOrderChange={(o) => dispatch(replaceOrderLocally(o))} />
          )}

          {/* The post-purchase conversation, in place of the confirmation checklist that used to live here. */}
          <OrderThread orderId={orderId} status={order.status} counterpartyName={order.counterparty_name} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <OrderSummaryCard order={order} />
        </div>
      </div>

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
    </PageBody>
  );
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground" render={<Link href={LIST_HREF} />}>
      <ArrowLeft data-icon="inline-start" />
      Back to Services
    </Button>
  );
}
