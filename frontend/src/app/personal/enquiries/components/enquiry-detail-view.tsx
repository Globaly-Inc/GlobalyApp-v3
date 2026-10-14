"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, GraduationCap, SearchX } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BackButton } from "@/components/ui/back-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionItem, DescriptionList } from "@/components/ui/description-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchEnquiry } from "../store/enquiries-slice";
import { STATUS_EXPLANATIONS, STATUS_ICON } from "../const";
import { formatDate, intakeLabel } from "../utils";
import { EnquiryDetailSkeleton } from "./enquiry-detail-skeleton";
import { EnquiryStatusBadge } from "./enquiry-status-badge";
import { UnlockedBusinessesList } from "./unlocked-businesses-list";

const LIST_HREF = "/personal/enquiries";

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
      <PageBody>
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" render={<Link href={LIST_HREF} />}>
          <ArrowLeft data-icon="inline-start" aria-hidden />
          Back to enquiries
        </Button>
        <Card className="border border-dashed border-border ring-0">
          <EmptyState icon={SearchX} title="Enquiry not found" description="It may have been removed, or the link is wrong." />
        </Card>
      </PageBody>
    );
  }

  const intake = intakeLabel(enquiry.preferred_intake, enquiry.preferred_year, "") ?? "Not specified";
  const unlocked = enquiry.unlocked_businesses ?? [];
  const StatusIcon = STATUS_ICON[enquiry.status];

  return (
    <PageBody>
      <PageHeader
        leading={
          <>
            <BackButton href={LIST_HREF} label="Back to enquiries" />
            <Avatar className="size-12 shrink-0 rounded-xl">
              {enquiry.institution_logo_url && (
                <AvatarImage src={enquiry.institution_logo_url} alt="" className="bg-card object-contain p-1" />
              )}
              <AvatarFallback className="rounded-xl bg-primary/10 text-primary">
                <GraduationCap className="size-5" aria-hidden />
              </AvatarFallback>
            </Avatar>
          </>
        }
        title={enquiry.course_name}
        badges={
          <>
            <EnquiryStatusBadge status={enquiry.status} />
            {enquiry.course_short_name && (
              <Badge variant="outline" className="font-normal text-muted-foreground">
                {enquiry.course_short_name}
              </Badge>
            )}
          </>
        }
        subtitle={enquiry.institution_name || undefined}
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          {/* What the status means for the student, in the same words on every screen
              that shows it. Muted rather than tinted: eight coloured banners would
              shout, and the badge above already carries the colour. */}
          <div className="flex items-start gap-2.5 rounded-lg bg-muted/60 px-3 py-2.5">
            <StatusIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">{STATUS_EXPLANATIONS[enquiry.status]}</p>
          </div>

          {/* The whole section goes when there is no message, rather than leaving an empty
              card under a heading. The message is optional — see 20260830_009. */}
          {enquiry.message && (
            <Card>
              <CardHeader>
                <CardTitle>Your message</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-line text-foreground">{enquiry.message}</p>
              </CardContent>
            </Card>
          )}

          {/* Only unlocked recipients — the API never returns the full matched list. `?? []`
              because the API and this app deploy independently: a server running older code
              omits the field, and reading .length off undefined would blank the page over
              one section. */}
          <UnlockedBusinessesList businesses={unlocked} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList columns={1}>
                <DescriptionItem label="Preferred intake">{intake}</DescriptionItem>
                <DescriptionItem label="Submitted">{formatDate(enquiry.created_at)}</DescriptionItem>
                <DescriptionItem label="Unlocked by">
                  {unlocked.length === 1 ? "1 business" : `${unlocked.length} businesses`}
                </DescriptionItem>
              </DescriptionList>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageBody>
  );
}
