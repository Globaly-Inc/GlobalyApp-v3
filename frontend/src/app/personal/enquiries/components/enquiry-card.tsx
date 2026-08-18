import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { STATUS_BADGE_CLASS, STATUS_BADGE_VARIANT, STATUS_LABEL } from "../const";
import type { EnquiryListItem } from "../apis/types";

export function EnquiryCard({ enquiry }: Readonly<{ enquiry: EnquiryListItem }>) {
  // Full course name is the headline — never the short code (EMHA/MSBA mean
  // nothing at a glance) and never the intake. Institution sits beneath it, with
  // the intake kept as secondary detail since it's still useful to the student.
  const intakeMonth = enquiry.preferred_intake?.trim();
  const intake = intakeMonth
    ? `${intakeMonth}${enquiry.preferred_year ? ` ${enquiry.preferred_year}` : ""} intake`
    : null;

  return (
    <Link href={`/personal/enquiries/${enquiry.id}`} className="block">
      <div className="flex items-start gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <MessageSquare className="size-5 text-primary" aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{enquiry.course_name}</p>
          {enquiry.institution_name && (
            <p className="mt-0.5 truncate text-sm text-primary">{enquiry.institution_name}</p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">
            {new Date(enquiry.created_at).toLocaleDateString()}
            {intake && <span> · {intake}</span>}
          </p>
        </div>

        <Badge
          variant={STATUS_BADGE_VARIANT[enquiry.status]}
          className={cn(STATUS_BADGE_CLASS[enquiry.status])}
        >
          {STATUS_LABEL[enquiry.status]}
        </Badge>
      </div>
    </Link>
  );
}

export function EnquiryCardSkeleton() {
  return (
    <div className="flex items-start gap-4 rounded-xl border bg-card p-4">
      <Skeleton className="size-11 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-5 w-20 rounded-full" />
    </div>
  );
}
