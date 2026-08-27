import Link from "next/link";
import { Calendar, Clock, Wallet } from "lucide-react";
import { FavouriteButton } from "../../../search/components/favourite-button";
import { coursePrice, formatDuration, formatNextIntake } from "../../../search/course-card-utils";
import { DEGREE_LABEL, type SearchCourse } from "../../../search/types";

function TileStat({ icon: Icon, value }: Readonly<{ icon: typeof Clock; value: string }>) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{value}</span>
    </span>
  );
}

/**
 * The compact course row the institution profile lists — the search page's CourseCard without
 * the crest and institution line, both of which every course on this page would repeat.
 */
export function InstitutionCourseTile({ course }: Readonly<{ course: SearchCourse }>) {
  const price = coursePrice(course);
  const duration = formatDuration(course.duration_weeks, course.study_mode);

  return (
    <div className="group relative rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40">
      {/* Whole-tile link sits underneath; the save button opts back into pointer events. */}
      <Link href={`/course/${course.slug}`} className="absolute inset-0 z-0" aria-label={course.name} />

      <div className="pointer-events-none flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
            {course.name}
          </h3>
          {course.degree_level && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {DEGREE_LABEL[course.degree_level] ?? course.degree_level}
            </p>
          )}
        </div>
        <div className="pointer-events-auto relative z-10 shrink-0">
          <FavouriteButton itemType="course" itemId={course.id} />
        </div>
      </div>

      <div className="pointer-events-none mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {price && <TileStat icon={Wallet} value={`${price.amount} · ${price.label}`} />}
        {duration && <TileStat icon={Clock} value={duration} />}
        <TileStat icon={Calendar} value={formatNextIntake(course.next_intake_year, course.next_intake_month)} />
      </div>
    </div>
  );
}
