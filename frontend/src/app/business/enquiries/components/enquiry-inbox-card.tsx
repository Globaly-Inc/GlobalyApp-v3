"use client";

import { useState } from "react";
import { ChevronDown, Lock, Mail, MessageSquare, Phone, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { DistributionListItem } from "../apis/types";
import { cn } from "@/lib/utils";
import { ENQUIRY_STATUS_BADGE_VARIANT, ENQUIRY_STATUS_LABEL } from "../const";
import { DistributionThread } from "./distribution-thread";

/** "January 2027 • 8/14/2026" — intake on the left, matched-on date on the right. */
function metaLine(item: DistributionListItem): string {
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
  item: DistributionListItem;
  unlockCost: number;
  credits: number | null;
  busy: boolean;
  onUnlock: () => void;
  onClose: () => void;
}>) {
  const isClosed = item.closed_at != null;
  const cannotAfford = credits != null && credits < unlockCost;
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{item.institution_name ?? "Institution not recorded"}</span>
            {item.max_accepts > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {item.accept_count}/{item.max_accepts} unlocked
              </span>
            )}
          </div>

          <p className="truncate text-sm font-medium">
            {item.course_name ?? item.course_short_name ?? "Course enquiry"}
          </p>

          {item.message && <p className="line-clamp-2 text-sm text-muted-foreground">{item.message}</p>}

          <p className="text-xs text-muted-foreground">{metaLine(item)}</p>
        </div>

        <Badge variant={ENQUIRY_STATUS_BADGE_VARIANT[item.status] ?? "secondary"} className="shrink-0">
          {ENQUIRY_STATUS_LABEL[item.status] ?? item.status}
        </Badge>
      </div>

      {/* Contact only exists on the item once the server has been paid. */}
      {item.is_unlocked && (item.student_name || item.student_email || item.student_phone) && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          {item.student_name && <p className="font-medium">{item.student_name}</p>}
          <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            {item.student_email && (
              <a href={`mailto:${item.student_email}`} className="inline-flex items-center gap-1.5 hover:underline">
                <Mail className="h-3.5 w-3.5" />
                {item.student_email}
              </a>
            )}
            {item.student_phone && (
              <a href={`tel:${item.student_phone}`} className="inline-flex items-center gap-1.5 hover:underline">
                <Phone className="h-3.5 w-3.5" />
                {item.student_phone}
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

      {/* Chat exists only once paid for. A closed thread stays readable, so the toggle
          survives closure even though the composer does not. */}
      {item.is_unlocked && (
        <div className="mt-3">
          <Button size="sm" variant="ghost" onClick={() => setChatOpen((o) => !o)} aria-expanded={chatOpen}>
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            Messages
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", chatOpen && "rotate-180")} aria-hidden />
          </Button>
          {chatOpen && (
            <div className="mt-2 rounded-md border border-border px-3 py-3">
              <DistributionThread
                distributionId={item.distribution_id}
                studentName={item.student_name ?? "the student"}
                isClosed={isClosed}
              />
            </div>
          )}
        </div>
      )}

      {/* A closed enquiry is terminal — no actions remain. */}
      {!isClosed && (
        <div className="mt-3 flex items-center gap-2">
          {!item.is_unlocked && (
            <Button size="sm" onClick={onUnlock} disabled={busy || cannotAfford}>
              <Lock className="h-3.5 w-3.5" />
              {busy ? "Unlocking…" : `Unlock — ${unlockCost} credits`}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>
            Close
          </Button>
          {!item.is_unlocked && cannotAfford && (
            <span className="text-xs text-destructive">Not enough credits to unlock.</span>
          )}
          {!item.is_unlocked && item.message_truncated && !cannotAfford && (
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
