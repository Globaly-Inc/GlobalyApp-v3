import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import type { Order } from "../apis";
import { formatDate, formatMoney } from "../utils";

/** The order's side column: money, dates and references. Read-only. */
export function OrderSummaryCard({ order }: Readonly<{ order: Order }>) {
  const held = order.status === "paid";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <DescriptionList columns={1}>
          <DescriptionItem label="Amount" className="tabular-nums">
            {formatMoney(order.amount_minor, order.currency)}
          </DescriptionItem>
          <DescriptionItem label="Created">{formatDate(order.created_at)}</DescriptionItem>
          {order.paid_at && <DescriptionItem label="Paid">{formatDate(order.paid_at)}</DescriptionItem>}
          {order.refunded_at && <DescriptionItem label="Refunded">{formatDate(order.refunded_at)}</DescriptionItem>}
          {order.cancelled_at && <DescriptionItem label="Cancelled">{formatDate(order.cancelled_at)}</DescriptionItem>}
          {order.payment_refund_id && (
            <DescriptionItem label="Refund reference" mono>
              {order.payment_refund_id}
            </DescriptionItem>
          )}
          {order.notes && (
            <DescriptionItem label="Notes">
              <span className="whitespace-pre-wrap font-normal">{order.notes}</span>
            </DescriptionItem>
          )}
        </DescriptionList>

        {held && (
          // Says exactly what is true: the money sits with the platform, and the refund path is the only
          // way it moves back.
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            The payment is held by GlobalyAI. If something goes wrong, report a problem and we&apos;ll look at
            the order.
          </p>
        )}

        {order.listing_deleted && (
          <p className="text-sm text-muted-foreground">
            This listing has since been removed. Your order and its history are unaffected.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
