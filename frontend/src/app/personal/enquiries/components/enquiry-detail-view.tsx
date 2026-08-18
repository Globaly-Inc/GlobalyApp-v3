"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchEnquiry } from "../store/enquiries-slice";
import { STATUS_BADGE_CLASS, STATUS_BADGE_VARIANT, STATUS_LABEL } from "../const";

function Meta({
  icon: Icon,
  label,
  value,
}: Readonly<{ icon: typeof Clock; label: string; value: string }>) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="truncate text-sm">{value}</p>
      </div>
    </div>
  );
}

export function EnquiryDetailView({ enquiryId }: Readonly<{ enquiryId: string }>) {
  const dispatch = useAppDispatch();
  const enquiry = useAppSelector((s) => s.enquiries.byId[enquiryId]);
  const status = useAppSelector((s) => s.enquiries.status);

  useEffect(() => {
    dispatch(fetchEnquiry(enquiryId));
  }, [dispatch, enquiryId]);

  if (!enquiry && status === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!enquiry) {
    return (
      <div className="text-sm text-muted-foreground">
        Enquiry not found.{" "}
        <Link href="/personal/enquiries" className="underline">
          Back to enquiries
        </Link>
      </div>
    );
  }

  const intake = enquiry.preferred_intake?.trim()
    ? `${enquiry.preferred_intake}${enquiry.preferred_year ? ` ${enquiry.preferred_year}` : ""}`
    : "Not specified";

  return (
    <div className="space-y-4 md:space-y-5">
      <Link
        href="/personal/enquiries"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to enquiries
      </Link>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <MessageSquare className="size-5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg leading-snug">{enquiry.course_name}</CardTitle>
              {enquiry.institution_name && (
                <p className="mt-0.5 text-sm text-primary">{enquiry.institution_name}</p>
              )}
              {enquiry.course_short_name && (
                <Badge variant="outline" className="mt-1.5 text-[10px]">
                  {enquiry.course_short_name}
                </Badge>
              )}
            </div>
          </div>
          <Badge
            variant={STATUS_BADGE_VARIANT[enquiry.status]}
            className={cn(STATUS_BADGE_CLASS[enquiry.status])}
          >
            {STATUS_LABEL[enquiry.status]}
          </Badge>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm whitespace-pre-line">{enquiry.message}</p>

          {/* Recipients are deliberately not shown. The student should only ever see
              businesses that have unlocked their enquiry, and unlocking does not
              exist in this phase — so there is nothing to list yet. */}
          <div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2">
            <Meta icon={CalendarDays} label="Preferred intake" value={intake} />
            <Meta icon={Clock} label="Submitted" value={new Date(enquiry.created_at).toLocaleDateString()} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
