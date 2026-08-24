import Link from "next/link";
import { CalendarDays, ChevronRight, Clock, GraduationCap } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EnquiryStatusBadge } from "./enquiry-status-badge";
import { formatDate, intakeLabel } from "../utils";

import type { EnquiryListItem } from "../apis/types";

export function EnquiryCard({ enquiry }: Readonly<{ enquiry: EnquiryListItem }>) {
  // Full course name is the headline — never the short code (EMHA/MSBA mean
  // nothing at a glance) and never the intake. Institution sits beneath it, with
  // the date and intake kept as secondary detail since they're still useful.
  const intake = intakeLabel(enquiry.preferred_intake, enquiry.preferred_year);

  return (
    <Link
      href={`/personal/enquiries/${enquiry.id}`}
      className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {/* Card, not a hand-rolled bordered div, so the row carries the same ring and
          radius as every other surface in the app. */}
      <Card className="flex-row items-center gap-4 p-4 transition-all group-hover:bg-muted/30 group-hover:ring-primary/25">
        <Avatar className="size-11 rounded-xl">
          {enquiry.institution_logo_url && (
            <AvatarImage src={enquiry.institution_logo_url} alt="" className="bg-white object-contain p-1" />
          )}
          <AvatarFallback className="rounded-xl bg-primary/10 text-primary">
            <GraduationCap className="size-5" aria-hidden />
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate font-semibold text-foreground">{enquiry.course_name}</p>
            {enquiry.course_short_name && (
              <Badge variant="outline" className="hidden shrink-0 font-normal text-muted-foreground sm:inline-flex">
                {enquiry.course_short_name}
              </Badge>
            )}
          </div>

          {enquiry.institution_name && (
            <p className="mt-0.5 truncate text-sm text-primary">{enquiry.institution_name}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5 shrink-0" aria-hidden />
              {formatDate(enquiry.created_at)}
            </span>
            {intake && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                {intake}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 self-start">
          <EnquiryStatusBadge status={enquiry.status} />
          <ChevronRight
            className="size-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground"
            aria-hidden
          />
        </div>
      </Card>
    </Link>
  );
}

export function EnquiryCardSkeleton() {
  return (
    <Card className="flex-row items-center gap-4 p-4">
      <Skeleton className="size-11 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-5 w-24 rounded-full" />
    </Card>
  );
}
