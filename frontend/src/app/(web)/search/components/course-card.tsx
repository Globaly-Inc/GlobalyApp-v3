import Link from "next/link";
import { Calendar, CircleCheck, Clock, FileText, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { flagFromIso2 } from "@/lib/utils";
import { CourseCompareButton } from "./course-compare-button";
import { FavouriteButton } from "./favourite-button";
import { coursePrice, formatDuration, formatNextIntake } from "../course-card-utils";
import type { FeePeriod, SearchCourse } from "../types";

function CourseStat({
  icon: Icon, label, value,
}: Readonly<{ icon: typeof Clock; label: string; value: string }>) {
  return (
    // Padding pairs with the parent's sm:divide-x so the partition lines sit evenly between
    // stats; the first cell drops its left padding to stay flush with the card edge.
    <div className="flex min-w-0 items-center gap-2 sm:px-4 sm:first:pl-0">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-tight">{label}</p>
        <p className="truncate text-sm font-medium text-foreground leading-tight">{value}</p>
      </div>
    </div>
  );
}

export function CourseCard({
  course, feePeriod,
}: Readonly<{ course: SearchCourse; feePeriod?: FeePeriod }>) {
  const durationLabel = formatDuration(course.duration_weeks, course.study_mode);
  const nextIntakeLabel = formatNextIntake(course.next_intake_year, course.next_intake_month);
  const price = coursePrice(course, feePeriod);
  const flag = flagFromIso2(course.country_code ?? "");

  const feeCurrency = course.domestic_currency ?? course.international_currency ?? undefined;
  const annualTuition = course.domestic_fee_total != null
    ? Number(course.domestic_fee_total)
    : course.international_fee_total != null ? Number(course.international_fee_total) : null;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-md">
      {/* Whole-card link sits underneath; every control below opts back into pointer events. */}
      <Link href={`/course/${course.slug}`} className="absolute inset-0 z-0" aria-label={course.name} />

      <div className="pointer-events-none flex flex-col sm:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-4 p-4 sm:flex-row">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
              {course.institution_logo_url ?? course.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={course.institution_logo_url ?? course.image_url ?? ""}
                  alt={course.awarding_institution ?? course.name}
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <GraduationCap className="h-8 w-8 text-muted-foreground" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
                {course.name}
              </h3>

              {course.awarding_institution && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <GraduationCap className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {course.awarding_institution}{course.country_name ? `, ${course.country_name}` : ""}
                  </span>
                  {flag && <span aria-hidden="true">{flag}</span>}
                </p>
              )}
            </div>

            <div className="pointer-events-auto relative z-10 flex shrink-0 items-center gap-3 self-start">
              <CourseCompareButton
                course={{
                  id: course.id, slug: course.slug, name: course.name,
                  institutionName: course.awarding_institution ?? undefined,
                  countryName: course.country_name ?? undefined,
                  durationLabel, subjectArea: course.subject_area,
                  nextIntakeLabel, annualTuition, feeCurrency,
                }}
              />
              <FavouriteButton itemType="course" itemId={course.id} />
            </div>
          </div>

          {/* Stacked on mobile, so the dividers only appear once the three sit side by side. */}
          <div className="grid min-w-0 grid-cols-1 gap-3 border-t border-border px-4 py-3 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border">
            <CourseStat icon={Clock} label="Course Duration" value={durationLabel ?? "—"} />
            <CourseStat icon={Calendar} label="Next Intake" value={nextIntakeLabel} />
            <CourseStat icon={FileText} label="Subject Area" value={course.subject_area ?? "—"} />
          </div>
        </div>

        {/* pointer-events-auto + z-10, same as the controls above: the card-wide overlay Link sits
            at inset-0, so anything meant to stay clickable has to opt back in. */}
        <div className="pointer-events-auto relative z-10 flex w-full flex-col justify-center gap-3 border-t border-border bg-muted/30 p-5 sm:w-48 sm:shrink-0 sm:border-l sm:border-t-0">
          {price ? (
            <div>
              <p className="text-xs text-muted-foreground">{price.label}</p>
              <p className="text-lg font-bold leading-tight text-foreground">{price.amount}</p>
            </div>
          ) : (
            <p className="text-xs italic text-muted-foreground">Fees on enquiry</p>
          )}

          <div className="flex flex-col gap-2">
            <Link href={`/course/${course.slug}#eligibility`}>
              <Button size="sm" variant="outline" className="h-9 w-full gap-1.5 text-xs font-normal text-muted-foreground">
                Eligibility<CircleCheck className="h-3.5 w-3.5" />
              </Button>
            </Link>
            {/* Carries the course into the enquiry dialog, which opens prefilled from
                ?course_id= (see personal/enquiries/components/enquiries-view.tsx).
                Anonymous visitors are bounced to sign-in by PersonalShell, which
                preserves this URL so they land back on the prefilled dialog. */}
            <Link href={`/personal/enquiries?course_id=${course.id}`}>
              <Button size="sm" className="h-9 w-full text-xs">Enquiry</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
