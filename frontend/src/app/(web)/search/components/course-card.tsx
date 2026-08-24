import Link from "next/link";
import { GraduationCap, Clock, Calendar, BookOpen, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CourseCompareButton } from "./course-compare-button";
import { MONTH_NAMES, type SearchCourse } from "../types";

function formatFee(amount: string | null, currency: string | null) {
  if (!amount) return null;
  const n = Number(amount);
  if (Number.isNaN(n)) return null;
  return `${currency ?? ""} ${n.toLocaleString()}`.trim();
}

export function CourseCard({ course }: Readonly<{ course: SearchCourse }>) {
  const durationLabel = course.duration_weeks ? `${course.duration_weeks} week${course.duration_weeks > 1 ? "s" : ""}` : null;
  const nextIntakeLabel = course.next_intake_year
    ? `${course.next_intake_month ? MONTH_NAMES[course.next_intake_month - 1] : ""} ${course.next_intake_year}`.trim()
    : "Intake TBC";
  const feeCurrency = course.domestic_currency ?? course.international_currency ?? undefined;
  const annualTuition = course.domestic_fee_total != null
    ? Number(course.domestic_fee_total)
    : course.international_fee_total != null ? Number(course.international_fee_total) : null;
  const fee = formatFee(course.domestic_fee_total, course.domestic_currency) ?? formatFee(course.international_fee_total, course.international_currency);

  return (
    <div className="group relative bg-card border border-border rounded-xl hover:shadow-md hover:border-primary/40 transition-all overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <Link href={`/course/${course.slug}`} className="flex-1 min-w-0 p-4">
          <div className="flex gap-3">
            <div className="w-14 h-14 rounded-lg border border-border bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
              {course.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={course.image_url} alt={course.name} className="w-full h-full object-contain p-1" />
              ) : (
                <GraduationCap className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="flex-1 min-w-0 font-semibold text-foreground group-hover:text-primary transition-colors leading-snug text-[15px] line-clamp-2">
                  {course.name}
                </h3>
                <div className="pointer-events-auto relative z-10">
                  <CourseCompareButton
                    course={{
                      id: course.id, slug: course.slug, name: course.name,
                      institutionName: course.awarding_institution ?? undefined,
                      countryName: course.country_name ?? undefined,
                      durationLabel, subjectArea: course.subject_area,
                      nextIntakeLabel, annualTuition, feeCurrency,
                    }}
                  />
                </div>
              </div>
              {course.awarding_institution && (
                <p className="text-xs text-muted-foreground mt-0.5">{course.awarding_institution}</p>
              )}
              {course.country_name && (
                <div className="flex items-center gap-1 mt-1.5">
                  <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <Badge variant="secondary" className="text-xs px-2 py-0 font-normal rounded-full">{course.country_name}</Badge>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 divide-x divide-border items-center">
            <div className="flex items-center gap-2 pr-4">
              <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none">Duration</p>
                <p className="text-xs font-medium text-foreground truncate">{durationLabel ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-4">
              <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none">Next Intake</p>
                <p className="text-xs font-medium text-foreground truncate">{nextIntakeLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-4">
              <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none">Subject Area</p>
                <p className="text-xs font-medium text-foreground truncate">{course.subject_area ?? "—"}</p>
              </div>
            </div>
          </div>

          {course.description && (
            <p className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground truncate">{course.description}</p>
          )}
        </Link>

        {/* pointer-events-auto + z-10, same as the Compare button above: the card-wide
            overlay Link sits at inset-0, so anything meant to stay clickable has to opt
            back in. Without it the Enquire click falls through to the course page. */}
        <div className="pointer-events-auto relative z-10 w-full sm:w-44 sm:flex-shrink-0 border-t sm:border-t-0 sm:border-l border-border bg-muted/30 p-5 flex flex-col justify-center gap-4">
          <div className="text-left">
            {fee ? (
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Annual tuition</p>
                <p className="text-lg font-bold text-primary leading-tight whitespace-nowrap">{fee}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">per year</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Fees on enquiry</p>
            )}
          </div>
          {/* Carries the course into the enquiry dialog, which opens prefilled from
              ?course_id= (see personal/enquiries/components/enquiries-view.tsx).
              A plain Link keeps this card a server component — no client JS added.
              Anonymous visitors are bounced to sign-in by PersonalShell, which
              preserves this URL so they land back on the prefilled dialog. */}
          <Link href={`/personal/enquiries?course_id=${course.id}`}>
            <Button size="sm" className="w-full text-xs h-9">Enquire</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
