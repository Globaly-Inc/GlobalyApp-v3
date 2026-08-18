import Link from "next/link";
import { Building2, Clock, BookOpen, GraduationCap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Course } from "../apis/types";
import { courseFee, formatFee, formatDuration, NOT_LISTED } from "../utils";

function MetaCell({
  icon: Icon,
  label,
  value,
}: Readonly<{ icon: typeof Clock; label: string; value: string }>) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="truncate text-sm">{value}</p>
      </div>
    </div>
  );
}

export function CourseCard({ course }: Readonly<{ course: Course }>) {
  const fee = courseFee(course);
  const institution = course.institution_name ?? course.awarding_institution;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col md:flex-row">
        {/* Main details */}
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-start gap-3">
            {/* Live data has no logos yet (image_url/logo_url are NULL on every
                row), so the initial placeholder is the normal state, not a fallback. */}
            <div className="flex size-11 shrink-0 items-center justify-center rounded-md border bg-muted/40">
              {course.institution_logo_url ?? course.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={(course.institution_logo_url ?? course.image_url)!}
                  alt=""
                  className="size-full rounded-md object-cover"
                />
              ) : (
                <Building2 className="size-5 text-muted-foreground" aria-hidden />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-base leading-snug font-semibold">{course.name}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                {institution && <span className="text-xs text-muted-foreground">{institution}</span>}
                {course.short_name && (
                  <Badge variant="outline" className="text-[10px]">
                    {course.short_name}
                  </Badge>
                )}
                {course.degree_level && (
                  <Badge variant="secondary" className="text-[10px]">
                    {course.degree_level}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-3">
            <MetaCell icon={Clock} label="Duration" value={formatDuration(course.duration_weeks)} />
            <MetaCell icon={GraduationCap} label="Study mode" value={course.study_mode ?? NOT_LISTED} />
            <MetaCell icon={BookOpen} label="Subject area" value={course.subject_area ?? NOT_LISTED} />
          </div>
        </div>

        {/* Tuition + action rail */}
        <div className="flex shrink-0 flex-col justify-between gap-3 border-t bg-muted/30 p-4 md:w-56 md:border-t-0 md:border-l">
          <div>
            <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Annual tuition
            </p>
            {fee ? (
              <>
                <p className="text-xl font-bold text-primary">{formatFee(fee)}</p>
                <p className="text-xs text-muted-foreground">per year</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Fee not listed</p>
            )}
          </div>

          <Button
            className="w-full"
            render={<Link href={`/personal/enquiries?course_id=${course.id}`}>Enquire</Link>}
          />
        </div>
      </div>
    </Card>
  );
}

export function CourseCardSkeleton() {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col md:flex-row">
        <div className="flex-1 p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="size-11 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-3">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        </div>
        <div className="shrink-0 space-y-2 border-t bg-muted/30 p-4 md:w-56 md:border-t-0 md:border-l">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </Card>
  );
}
