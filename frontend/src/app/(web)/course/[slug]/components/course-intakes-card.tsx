import { Calendar } from "lucide-react";
import { SectionCard } from "./section-card";
import { MONTH_NAMES, type CourseDetail } from "../../../search/types";

export function CourseIntakesCard({ intakes }: Readonly<{ intakes: CourseDetail["intakes"] }>) {
  return (
    <SectionCard icon={Calendar} title="Intakes">
      {intakes.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No intakes configured yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {intakes.map((intake) => {
            const label = intake.intake_name
              ?? (intake.intake_month && intake.intake_year
                ? `${MONTH_NAMES[intake.intake_month - 1]} ${intake.intake_year}`
                : "Intake TBC");
            return (
              <div key={intake.id} className="flex items-center justify-between border-b border-border pb-2 last:border-b-0 last:pb-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                {intake.admission_deadline && (
                  <p className="text-xs text-muted-foreground">
                    Apply by {new Date(intake.admission_deadline).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
