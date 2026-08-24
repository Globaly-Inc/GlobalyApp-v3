import { GraduationCap } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { durationLabel, feeLabel, prettyMode } from "../utils";

import type { Course } from "../apis/types";

/**
 * What the student just picked, under the course field.
 *
 * The Combobox trigger can only show one truncated line, and course names repeat
 * across institutions — this is the confirmation that the right one is selected
 * before a message is written. Every value is optional in extracted data, so each
 * chip appears only when it has something to say.
 */
export function CoursePreview({ course }: Readonly<{ course: Course }>) {
  const institution = course.institution_name ?? course.awarding_institution;
  const fee = feeLabel(course.international_fee_total, course.international_currency);
  const chips = [
    course.degree_level,
    durationLabel(course.duration_weeks),
    prettyMode(course.study_mode),
    fee && `${fee} intl. fee`,
  ].filter((chip): chip is string => !!chip);

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
      <Avatar className="size-9 rounded-lg">
        {course.institution_logo_url && (
          <AvatarImage src={course.institution_logo_url} alt="" className="bg-white object-contain p-0.5" />
        )}
        <AvatarFallback className="rounded-lg bg-primary/10 text-primary">
          <GraduationCap className="size-4" aria-hidden />
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{course.name}</p>
        {institution && <p className="truncate text-xs text-primary">{institution}</p>}
        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {chips.map((chip) => (
              <Badge key={chip} variant="outline" className="font-normal text-muted-foreground">
                {chip}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Holds the preview's footprint while the catalog loads, so a deep-linked dialog
 *  doesn't reflow the moment the course resolves. */
export function CoursePreviewSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
      <Skeleton className="size-9 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-5 w-40 rounded-full" />
      </div>
    </div>
  );
}
