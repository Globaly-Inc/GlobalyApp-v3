import { GraduationCap } from "lucide-react";
import { SectionCard } from "./section-card";
import { DEGREE_LABEL, type CourseDetail } from "../../../search/types";

function Field({ label, value }: Readonly<{ label: string; value: string | null }>) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      {value ? (
        <p className="text-sm font-medium text-foreground">{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground italic">Not set</p>
      )}
    </div>
  );
}

export function CourseDetailsCard({ course }: Readonly<{ course: CourseDetail }>) {
  const degreeLabel = course.degree_level ? (DEGREE_LABEL[course.degree_level] ?? course.degree_level) : null;

  return (
    <SectionCard icon={GraduationCap} title="Course details">
      <div className="flex flex-col gap-3">
        <Field label="Awarded by" value={course.awarding_institution} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Degree level" value={degreeLabel} />
          <Field label="Area of study" value={course.subject_area} />
        </div>
      </div>
    </SectionCard>
  );
}
