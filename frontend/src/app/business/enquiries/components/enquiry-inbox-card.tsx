import Link from "next/link";
import { CalendarDays, Clock, GraduationCap, Lock, Mail, MessageSquare, Phone, Users, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EnquiryStatusBadge } from "./enquiry-status-badge";
import { formatDate, initials, intakeLabel } from "../utils";

import type { DistributionListItem } from "../apis/types";

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
  const intake = intakeLabel(item.preferred_intake, item.preferred_year);

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start gap-4">
        {/* Named once unlocked, anonymous before — so the tile carries the student's
            initials when we know them and falls back to the course icon when we don't. */}
        <Avatar className="size-11 rounded-xl">
          <AvatarFallback className="rounded-xl bg-primary/10 text-sm text-primary">
            {item.student_name ? (
              initials(item.student_name)
            ) : (
              <GraduationCap className="size-5" aria-hidden />
            )}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">
            {item.course_name ?? item.course_short_name ?? "Course enquiry"}
          </p>
          {item.institution_name && (
            <p className="mt-0.5 truncate text-sm text-primary">{item.institution_name}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5 shrink-0" aria-hidden />
              {formatDate(item.created_at)}
            </span>
            {intake && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                {intake}
              </span>
            )}
            {item.max_accepts > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5 shrink-0" aria-hidden />
                {item.accept_count}/{item.max_accepts} unlocked
              </span>
            )}
          </div>
        </div>

        <EnquiryStatusBadge status={item.status} className="self-start" />
      </div>

      {item.message && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {item.message_truncated ? "Message preview" : "Their message"}
          </p>
          <p className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm whitespace-pre-line">
            {item.message}
          </p>
        </div>
      )}

      {/* Contact only exists on the item once the server has been paid. The chat button
          sits beside the name rather than down in the action row: the conversation belongs
          with the person, and it is what an agent reaches for first after unlocking. Keyed
          on `is_unlocked` alone so the button still has a home if the student left no
          contact details. A closed thread stays readable, so this survives closure even
          though the composer does not. */}
      {item.is_unlocked && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm">
          <div className="min-w-0 flex-1">
            {item.student_name && <p className="truncate font-medium">{item.student_name}</p>}
            <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              {item.student_email && (
                <a href={`mailto:${item.student_email}`} className="inline-flex items-center gap-1.5 hover:underline">
                  <Mail className="size-3.5" aria-hidden />
                  {item.student_email}
                </a>
              )}
              {item.student_phone && (
                <a href={`tel:${item.student_phone}`} className="inline-flex items-center gap-1.5 hover:underline">
                  <Phone className="size-3.5" aria-hidden />
                  {item.student_phone}
                </a>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/business/messages?thread=${item.distribution_id}`} />}
          >
            <MessageSquare className="size-3.5" aria-hidden />
            {isClosed ? "View chat" : "Open chat"}
          </Button>
        </div>
      )}

      {isClosed && item.close_reason && (
        <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Closed:</span> {item.close_reason}
        </p>
      )}

      {/* A closed enquiry is terminal — no actions remain, so the row goes with them
          rather than leaving an empty box under the card's gap. */}
      {!isClosed && (
        <div className="flex flex-wrap items-center gap-2">
          {!item.is_unlocked && (
            <Button size="sm" onClick={onUnlock} disabled={busy || cannotAfford}>
              <Lock className="size-3.5" aria-hidden />
              {busy ? "Unlocking…" : `Unlock — ${unlockCost} credits`}
            </Button>
          )}
          {/* Outline, not ghost: ghost reads as a text link until you hover it, and this
              one ends the lead for good. */}
          <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>
            <X className="size-3.5" aria-hidden />
            Close
          </Button>
          {!item.is_unlocked && cannotAfford && (
            <span className="text-xs text-destructive">Not enough credits to unlock.</span>
          )}
          {!item.is_unlocked && item.message_truncated && !cannotAfford && (
            <span className="text-xs text-muted-foreground">
              Unlock to see the full message and contact details.
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

export function EnquiryInboxCardSkeleton() {
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start gap-4">
        <Skeleton className="size-11 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-3 w-44" />
        </div>
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-8 w-40 rounded-lg" />
    </Card>
  );
}
