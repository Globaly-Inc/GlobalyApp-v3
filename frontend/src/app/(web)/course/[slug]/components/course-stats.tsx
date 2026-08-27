import { Calendar, Clock, FileText, Wallet } from "lucide-react";
import { coursePrice, formatDuration, formatNextIntake } from "../../../search/course-card-utils";
import type { CourseDetail } from "../../../search/types";

/** The headline facts strip under the hero — the same four the search card leads with. */
export function CourseStats({ course }: Readonly<{ course: CourseDetail }>) {
  const price = coursePrice(course);
  // `next_intake_*` are listing-only columns, so read the detail's own intake list instead —
  // it arrives ordered by year then month, and this keeps the stat and the Upcoming Intakes
  // card below it stating the same date by construction.
  const next = course.intakes[0];

  const stats = [
    { icon: Clock, label: "Course Duration", value: formatDuration(course.duration_weeks, course.study_mode) ?? "—" },
    { icon: Wallet, label: "Course Fee", value: price ? `${price.amount} · ${price.label}` : "On enquiry" },
    {
      icon: Calendar,
      label: "Next Intake",
      value: formatNextIntake(
        next?.intake_year ?? course.next_intake_year,
        next?.intake_month ?? course.next_intake_month,
      ),
    },
    { icon: FileText, label: "Subject Area", value: course.subject_area ?? "—" },
  ];

  return (
    <div className="grid grid-cols-1 divide-border rounded-xl border border-border bg-card sm:grid-cols-2 sm:divide-x lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-center gap-3 px-5 py-4">
          <stat.icon className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{stat.value}</p>
            <p className="truncate text-xs text-muted-foreground">{stat.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
