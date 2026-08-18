"use client";

import { Lock, Mail, MapPin, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { InboxItem } from "../apis/types";
import { ENQUIRY_STATUS_BADGE_VARIANT, ENQUIRY_STATUS_LABEL } from "../const";

/**
 * How a lead is titled.
 *
 * The D1 module does not join a course or an institution onto an inbox row — an
 * enquiry references a tenant service uuid, and a locked row is masked down to a
 * first name — so the student is the only thing there is to name. Exported
 * because the confirm/close dialogs have to name the same lead the card does.
 */
export function leadLabel(item: InboxItem): string {
  return item.unlocked
    ? `${item.student.first_name} ${item.student.last_name}`.trim()
    : `Enquiry from ${item.student.first_name}`;
}

/** "January 2027 • 8/14/2026" — intake on the left, matched-on date on the right. */
function metaLine(item: InboxItem): string {
  const intake = [item.preferred_intake, item.preferred_year].filter(Boolean).join(" ");
  const matched = new Date(item.created_at).toLocaleDateString();
  return intake ? `${intake} • ${matched}` : matched;
}

export function EnquiryInboxCard({
  item,
  unlockCost,
  credits,
  busy,
  onUnlock,
  onClose,
}: Readonly<{
  item: InboxItem;
  unlockCost: number;
  credits: number | null;
  busy: boolean;
  onUnlock: () => void;
  onClose: () => void;
}>) {
  const isClosed = item.status === "closed";
  // The row's own frozen price is what unlock will actually spend; unlockCost is
  // only the headline figure for a lead this business has not received yet.
  const cost = item.coin_cost > 0 ? item.coin_cost : unlockCost;
  const cannotAfford = credits != null && credits < cost;

  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {item.distance_km == null ? (
              <span className="truncate">Distance not recorded</span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {Math.round(item.distance_km)} km away
              </span>
            )}
          </div>

          <p className="truncate text-sm font-medium">{leadLabel(item)}</p>

          <p className="line-clamp-2 text-sm text-muted-foreground">
            {item.unlocked ? item.message : item.message_preview}
          </p>

          <p className="text-xs text-muted-foreground">{metaLine(item)}</p>
        </div>

        <Badge variant={ENQUIRY_STATUS_BADGE_VARIANT[item.status] ?? "secondary"} className="shrink-0">
          {ENQUIRY_STATUS_LABEL[item.status] ?? item.status}
        </Badge>
      </div>

      {/* Contact only exists on the item once the server has been paid: the locked
          shape does not carry these keys at all, so `item.unlocked` is what makes
          them readable here rather than a nullish check. */}
      {item.unlocked && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <p className="font-medium">{leadLabel(item)}</p>
          <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            <a href={`mailto:${item.student.email}`} className="inline-flex items-center gap-1.5 hover:underline">
              <Mail className="h-3.5 w-3.5" />
              {item.student.email}
            </a>
            {item.student.phone && (
              <a href={`tel:${item.student.phone}`} className="inline-flex items-center gap-1.5 hover:underline">
                <Phone className="h-3.5 w-3.5" />
                {item.student.phone}
              </a>
            )}
          </div>
        </div>
      )}

      {isClosed && item.close_reason && (
        <p className="mt-3 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Closed:</span> {item.close_reason}
        </p>
      )}

      {/* A closed enquiry is terminal — no actions remain. */}
      {!isClosed && (
        <div className="mt-3 flex items-center gap-2">
          {!item.unlocked && (
            <Button size="sm" onClick={onUnlock} disabled={busy || cannotAfford}>
              <Lock className="h-3.5 w-3.5" />
              {busy ? "Unlocking…" : `Unlock — ${cost} credits`}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>
            Close
          </Button>
          {!item.unlocked && cannotAfford && (
            <span className="text-xs text-destructive">Not enough credits to unlock.</span>
          )}
          {!item.unlocked && !cannotAfford && (
            <span className="text-xs text-muted-foreground">Unlock to see the full message and contact details.</span>
          )}
        </div>
      )}
    </div>
  );
}

export function EnquiryInboxCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="w-full space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-5 w-20 shrink-0" />
      </div>
      <Skeleton className="mt-3 h-8 w-48" />
    </div>
  );
}
