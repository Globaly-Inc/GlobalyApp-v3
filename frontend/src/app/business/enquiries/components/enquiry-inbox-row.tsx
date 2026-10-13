import Link from "next/link";
import { CalendarDays, GraduationCap, Lock, Mail, MessageSquare, Phone, PhoneOff, User, Users, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { EnquiryStatusBadge } from "./enquiry-status-badge";
import { EligibilityBadge } from "./eligibility-badge";
import { cn } from "@/lib/utils";
import { formatDate, initials, intakeLabel } from "../utils";

import type { DistributionListItem } from "../apis/types";

/** Column headers for the rows below — kept beside the row so the two can't drift apart. */
export const INBOX_COLUMNS = [
  { label: "Student" },
  { label: "Course", className: "hidden md:table-cell" },
  { label: "Status" },
  { label: "Received", className: "hidden lg:table-cell" },
  { label: "Actions", className: "w-px", srOnly: true },
] as const;

type Props = Readonly<{
  item: DistributionListItem;
  unlockCost: number;
  credits: number | null;
  busy: boolean;
  onUnlock: () => void;
  onClose: () => void;
}>;

export function EnquiryInboxRow({ item, unlockCost, credits, busy, onUnlock, onClose }: Props) {
  const unlocked = item.is_unlocked;
  const course = item.course_name ?? item.course_short_name ?? "Course enquiry";

  return (
    <TableRow className="align-top">
      <TableCell primary className="whitespace-normal">
        <StudentCell item={item} />
        {/* Hidden columns ride along in the primary cell, so every field survives a phone width. */}
        <div className="mt-2 md:hidden">
          <CourseCell item={item} course={course} />
        </div>
        <div className="mt-2 text-xs text-muted-foreground lg:hidden">
          <ReceivedCell item={item} />
        </div>
      </TableCell>
      <TableCell className="hidden min-w-64 whitespace-normal md:table-cell">
        <CourseCell item={item} course={course} />
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1.5">
          <EnquiryStatusBadge status={item.status} />
          <EligibilityBadge status={item.eligibility_status} />
        </div>
      </TableCell>
      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
        <ReceivedCell item={item} />
      </TableCell>
      <TableCell>
        {item.closed_at == null && (
          <RowActions
            unlocked={unlocked}
            busy={busy}
            cannotAfford={credits != null && credits < unlockCost}
            distributionId={item.distribution_id}
            onUnlock={onUnlock}
            onClose={onClose}
          />
        )}
      </TableCell>
    </TableRow>
  );
}

function StudentCell({ item }: Readonly<{ item: DistributionListItem }>) {
  const unlocked = item.is_unlocked;
  return (
    <div className="flex items-start gap-3">
      <Avatar className="size-9 shrink-0 rounded-lg">
        {/* The photo only exists on the payload once unlocked, so no `unlocked &&` guard is
            needed here — a locked row simply has nothing to render and falls through to the initial. */}
        {item.student_photo_url && <AvatarImage src={item.student_photo_url} alt="" className="rounded-lg object-cover" />}
        <AvatarFallback className="rounded-lg bg-primary-light text-sm text-primary">
          {item.student_first_name ? initials(item.student_first_name) : <GraduationCap className="size-4" aria-hidden />}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        {/* Locked: the first name is real, the surname is a placeholder — the server never
            sent the real one, so there is nothing here to un-blur. */}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-foreground">
          {unlocked ? (item.student_name ?? "Student") : (item.student_first_name ?? "Student")}
          {!unlocked && <Redacted className="w-20" />}
        </p>
        {unlocked && item.student_email ? (
          <a
            href={`mailto:${item.student_email}`}
            className="mt-0.5 inline-flex max-w-full items-center gap-1.5 text-xs text-muted-foreground hover:underline"
          >
            <Mail className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{item.student_email}</span>
          </a>
        ) : (
          // Shape only: nothing here derives from the real address — the server does not send it
          // before someone pays. The domain is a placeholder so the row implies nothing untrue.
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Mail className="mr-0.5 size-3.5 shrink-0" aria-hidden />
            <Redacted className="w-24" />
            <span>@gmail.com</span>
          </p>
        )}
        {unlocked && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
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
  );
}

function CourseCell({ item, course }: Readonly<{ item: DistributionListItem; course: string }>) {
  return (
    <>
      <p className="font-medium text-foreground">{course}</p>
      {item.institution_name && (
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <GraduationCap className="size-3.5 shrink-0" aria-hidden />
          {item.institution_name}
        </p>
      )}
      {/* Two lines maximum: the server truncates a locked teaser, but an unlocked message is the
          full text and could be 5000 characters. */}
      {item.message && (
        <p className="mt-2 line-clamp-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
          {item.message}
        </p>
      )}
      {item.closed_at != null && item.close_reason && (
        <p className="mt-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Closed:</span> {item.close_reason}
        </p>
      )}
    </>
  );
}

function ReceivedCell({ item }: Readonly<{ item: DistributionListItem }>) {
  const intake = intakeLabel(item.preferred_intake, item.preferred_year);
  const unlocked = item.is_unlocked;
  return (
    <div className="space-y-1">
      <p className="text-sm text-foreground">{formatDate(item.created_at)}</p>
      {intake && (
        <p className="inline-flex items-center gap-1">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden />
          {intake}
        </p>
      )}
      {item.max_accepts > 0 && (
        <p className={cn("flex items-center gap-1 font-medium", unlocked ? "text-success" : "text-warning")}>
          {unlocked ? <Users className="size-3.5" aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
          {item.accept_count}/{item.max_accepts} unlocked
        </p>
      )}
    </div>
  );
}

function RowActions({
  unlocked, busy, cannotAfford, distributionId, onUnlock, onClose,
}: Readonly<{
  unlocked: boolean;
  busy: boolean;
  cannotAfford: boolean;
  distributionId: string;
  onUnlock: () => void;
  onClose: () => void;
}>) {
  return (
    <div className="flex w-32 flex-col gap-1.5">
      {!unlocked && (
        <Button size="sm" onClick={onUnlock} disabled={busy || cannotAfford}>
          <Lock className="size-3.5" aria-hidden />
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
      )}
      {/* Three tiers: Open chat is the one an agent reaches for first, so it is the only filled
          button; Profile is the supporting read; Close ends the lead for good — muted, turning
          destructive only on hover, and bordered so it never reads as a mere text link. */}
      {unlocked && (
        <>
          <Button size="sm" render={<Link href={`/business/messages?thread=${distributionId}`} />}>
            <MessageSquare className="size-3.5" aria-hidden />
            Open chat
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
            render={<Link href={`/business/enquiries/${distributionId}/student`} />}
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
        className="text-muted-foreground hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
      >
        <X className="size-3.5" aria-hidden />
        Close
      </Button>
      {/* Only the blocking case is stated per row; the price lives in the banner above the list. */}
      {!unlocked && cannotAfford && <span className="text-center text-xs text-destructive">Not enough credits.</span>}
    </div>
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
