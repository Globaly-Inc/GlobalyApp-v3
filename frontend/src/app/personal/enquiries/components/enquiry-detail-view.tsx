"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, GraduationCap, LockOpen, SearchX } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchEnquiry } from "../store/enquiries-slice";
import { STATUS_EXPLANATIONS, STATUS_ICON } from "../const";
import { formatDate, intakeLabel } from "../utils";
import { EnquiryDetailSkeleton } from "./enquiry-detail-skeleton";
import { EnquiryStatusBadge } from "./enquiry-status-badge";
import { UnlockedBusinessesList } from "./unlocked-businesses-list";

function DetailStat({
  icon: Icon,
  label,
  value,
}: Readonly<{ icon: typeof Clock; label: string; value: string }>) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" render={<Link href="/personal/enquiries" />}>
      <ArrowLeft className="size-4" aria-hidden />
      Back to enquiries
    </Button>
  );
}

export function EnquiryDetailView({ enquiryId }: Readonly<{ enquiryId: string }>) {
  const dispatch = useAppDispatch();
  const enquiry = useAppSelector((s) => s.enquiries.byId[enquiryId]);
  const status = useAppSelector((s) => s.enquiries.status);

  // Guarded by id, not a bare boolean: Strict Mode double-invokes the effect, and
  // navigating between two enquiries still has to refetch.
  const fetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (fetchedRef.current === enquiryId) return;
    fetchedRef.current = enquiryId;
    dispatch(fetchEnquiry(enquiryId));
  }, [dispatch, enquiryId]);

  if (!enquiry && status === "loading") return <EnquiryDetailSkeleton />;

  if (!enquiry) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card className="items-center gap-2 border border-dashed border-border px-6 py-14 text-center ring-0">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <SearchX className="size-6" aria-hidden />
          </div>
          <p className="mt-1 font-semibold text-foreground">Enquiry not found</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            It may have been removed, or the link is wrong.
          </p>
        </Card>
      </div>
    );
  }

  const intake = intakeLabel(enquiry.preferred_intake, enquiry.preferred_year, "") ?? "Not specified";
  const unlocked = enquiry.unlocked_businesses ?? [];
  const StatusIcon = STATUS_ICON[enquiry.status];

  return (
    <div className="space-y-4 md:space-y-5">
      <BackLink />

      <Card className="[--card-spacing:--spacing(5)]">
        <CardHeader>
          <div className="flex min-w-0 items-start gap-4">
            <Avatar className="size-12 rounded-xl">
              {enquiry.institution_logo_url && (
                <AvatarImage src={enquiry.institution_logo_url} alt="" className="bg-white object-contain p-1" />
              )}
              <AvatarFallback className="rounded-xl bg-primary/10 text-primary">
                <GraduationCap className="size-5" aria-hidden />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <CardTitle className="text-lg leading-snug font-semibold">{enquiry.course_name}</CardTitle>
              {enquiry.institution_name && (
                <p className="mt-0.5 text-sm text-primary">{enquiry.institution_name}</p>
              )}
              {enquiry.course_short_name && (
                <Badge variant="outline" className="mt-2 font-normal text-muted-foreground">
                  {enquiry.course_short_name}
                </Badge>
              )}
            </div>
          </div>
          <CardAction>
            <EnquiryStatusBadge status={enquiry.status} />
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* What the status means for the student, in the same words on every screen
              that shows it. Muted rather than tinted: eight coloured banners would
              shout, and the badge above already carries the colour. */}
          <div className="flex items-start gap-2.5 rounded-lg bg-muted/60 px-3 py-2.5">
            <StatusIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">{STATUS_EXPLANATIONS[enquiry.status]}</p>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Your message
            </p>
            <p className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm whitespace-pre-line">
              {enquiry.message}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-3">
            <DetailStat icon={CalendarDays} label="Preferred intake" value={intake} />
            <DetailStat icon={Clock} label="Submitted" value={formatDate(enquiry.created_at)} />
            <DetailStat
              icon={LockOpen}
              label="Unlocked by"
              value={unlocked.length === 1 ? "1 business" : `${unlocked.length} businesses`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Its own segment, below the enquiry itself. Only unlocked recipients — the
          API never returns the full matched list. `?? []` because the API and this
          app deploy independently: a server running older code omits the field, and
          reading .length off undefined would blank the page over one section. */}
      <UnlockedBusinessesList businesses={unlocked} />
    </div>
  );
}
