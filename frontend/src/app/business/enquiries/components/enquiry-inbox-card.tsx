import Link from "next/link";
import { CalendarDays, Clock, GraduationCap, Lock, Mail, MessageSquare, Phone, PhoneOff, User, Users, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EnquiryStatusBadge } from "./enquiry-status-badge";
import { EligibilityBadge } from "./eligibility-badge";
import { cn } from "@/lib/utils";
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
  const unlocked = item.is_unlocked;

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-col sm:flex-row">
        <div className="min-w-0 flex-1 p-3.5">
          <div className="flex items-start gap-3">
            <Avatar className="size-10 shrink-0 rounded-xl">
              {/* The photo only exists on the payload once unlocked, so no `unlocked &&` guard is
                  needed here — a locked row simply has nothing to render and falls through to the
                  initial. */}
              {item.student_photo_url && (
                <AvatarImage src={item.student_photo_url} alt="" className="rounded-xl object-cover" />
              )}
              <AvatarFallback className="rounded-xl bg-primary/10 text-sm text-primary">
                {item.student_first_name ? (
                  initials(item.student_first_name)
                ) : (
                  <GraduationCap className="size-5" aria-hidden />
                )}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              {/* Locked: the first name is real, the surname is a placeholder — the server never
                  sent the real one, so there is nothing here to un-blur. */}
              {/* Badges share the name's row rather than sitting above it — two pills were costing
                  a full line of card height. */}
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-foreground">
                  {unlocked ? (item.student_name ?? "Student") : (item.student_first_name ?? "Student")}
                  {!unlocked && <Redacted className="w-20" />}
                </p>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <EnquiryStatusBadge status={item.status} />
                  <EligibilityBadge status={item.eligibility_status} />
                </div>
              </div>

              {unlocked && item.student_email ? (
                <a
                  href={`mailto:${item.student_email}`}
                  className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline"
                >
                  <Mail className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{item.student_email}</span>
                </a>
              ) : (
                // Shape only: the whole local part is a blurred block, with a placeholder domain
                // after it. Nothing here derives from the real address — the server does not send
                // it before someone pays. The domain reads `@email.com` rather than a real
                // provider so the card cannot imply something about the student that is untrue.
                <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                  <Mail className="mr-0.5 size-3.5 shrink-0" aria-hidden />
                  <Redacted className="w-28" />
                  <span>@email.com</span>
                </p>
              )}

              {unlocked && (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  {item.student_phone_withheld ? (
                    <>
                      <PhoneOff className="size-3.5 shrink-0" aria-hidden />
                      Phone number not shared
                    </>
                  ) : (
                    item.student_phone && (
                      <>
                        <Phone className="size-3.5 shrink-0" aria-hidden />
                        <a href={`tel:${item.student_phone}`} className="hover:underline">
                          {item.student_phone}
                        </a>
                      </>
                    )
                  )}
                </p>
              )}
            </div>
          </div>

          <p className="mt-2.5 text-sm font-semibold text-foreground">
            {item.course_name ?? item.course_short_name ?? "Course enquiry"}
          </p>
          {item.institution_name && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <GraduationCap className="size-3.5 shrink-0" aria-hidden />
              {item.institution_name}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5 shrink-0" aria-hidden />
              {formatDate(item.created_at)}
            </span>
            {intake && (
              <>
                <Dot />
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                  {intake}
                </span>
              </>
            )}
            {item.max_accepts > 0 && (
              <>
                <Dot />
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-medium",
                    unlocked ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {unlocked ? <Users className="size-3.5" aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
                  {item.accept_count}/{item.max_accepts} unlocked
                </span>
              </>
            )}
          </div>

          {/* Sits under the meta row because it is the last thing to read, and it is absent on
              most enquiries now that the message is optional. */}
          {item.message && (
            // Two lines maximum: the server already truncates a locked teaser, but an unlocked
            // message is the full text and could be 5000 characters of card.
            <p className="mt-2 line-clamp-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground">
              {item.message}
            </p>
          )}

          {isClosed && item.close_reason && (
            <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Closed:</span> {item.close_reason}
            </p>
          )}
        </div>

        {/* Actions in their own column, divided off — the left side is what you read, this is what
            you do about it. Falls under the content on narrow screens. */}
        {!isClosed && (
          <div className="flex shrink-0 flex-col justify-center gap-1.5 border-t p-3.5 sm:w-44 sm:border-t-0 sm:border-l">
            {!unlocked && (
              <Button size="sm" onClick={onUnlock} disabled={busy || cannotAfford} className="w-full">
                <Lock className="size-3.5" aria-hidden />
                {busy ? "Unlocking…" : "Unlock"}
              </Button>
            )}
            {/* Three tiers, because the three actions are not equals once a lead is paid for.
                Open chat is the one an agent reaches for first, so it is the only filled button.
                Profile is the supporting read, prominent but not competing. Close ends the lead
                for good and belongs at the bottom of the hierarchy — muted, turning destructive
                only on hover, so it is never the thing the eye lands on.

                It stays a bordered button rather than a ghost: a ghost reads as a text link until
                you hover it, and this one is irreversible. */}
            {unlocked && (
              <>
                <Button
                  size="sm"
                  className="w-full"
                  render={<Link href={`/business/messages?thread=${item.distribution_id}`} />}
                >
                  <MessageSquare className="size-3.5" aria-hidden />
                  Open chat
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
                  render={<Link href={`/business/enquiries/${item.distribution_id}/student`} />}
                >
                  <User className="size-3.5" aria-hidden />
                  Profile
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={onClose}
              disabled={busy}
              className="w-full text-muted-foreground hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
            >
              <X className="size-3.5" aria-hidden />
              Close
            </Button>
            {/* Only the blocking case is stated per card. The price is the same on every row, so
                it lives in the banner above the list rather than being repeated N times. */}
            {!unlocked && cannotAfford && (
              <span className="text-center text-xs text-destructive">Not enough credits.</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/** A blurred stand-in for data the server withheld. Not the real value under a filter. */
function Redacted({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      aria-label="Hidden until unlocked"
      className={cn("inline-block h-[1em] shrink-0 rounded bg-muted-foreground/25 align-middle blur-[3px]", className)}
    />
  );
}

function Dot() {
  return <span className="text-muted-foreground/40" aria-hidden>•</span>;
}

/** Mirrors the real card's two-column split, so the list does not reflow when the data lands. */
export function EnquiryInboxCardSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-col sm:flex-row">
        <div className="flex-1 space-y-2.5 p-3.5">
          <div className="flex items-start gap-3">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-5 w-24 shrink-0 rounded-full" />
          </div>
          <Skeleton className="h-3.5 w-60" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="flex shrink-0 flex-col justify-center gap-1.5 border-t p-3.5 sm:w-44 sm:border-t-0 sm:border-l">
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
      </div>
    </Card>
  );
}
