import { BookMarked, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProfileSection } from "../../../components/profile/profile-section";
import { STUDY_LOAD_LABEL, STUDY_MODE_LABEL, type CourseDetail } from "../../../search/types";

/** The units the course is made of — code, name and credit points, as the admin has them linked. */
export function CourseStudyUnitsCard({ units }: Readonly<{ units: CourseDetail["study_units"] }>) {
  if (units.length === 0) return null;

  return (
    <ProfileSection icon={BookMarked} title="Study Units" count={units.length}>
      <ul className="divide-y divide-border">
        {units.map((unit) => (
          <li key={unit.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            {unit.unit_code && (
              <Badge variant="outline" className="mt-0.5 shrink-0 text-[10px]">{unit.unit_code}</Badge>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">{unit.unit_name}</p>
              {unit.description && <p className="mt-0.5 text-xs text-muted-foreground">{unit.description}</p>}
            </div>
            {unit.credit_points != null && (
              <Badge className="shrink-0 bg-primary/10 text-[10px] text-primary">{unit.credit_points} CP</Badge>
            )}
          </li>
        ))}
      </ul>
    </ProfileSection>
  );
}

/** How the course can be taken — one tile per mode/load, with the duration that option runs for. */
export function CourseStudyOptionsCard({ options }: Readonly<{ options: CourseDetail["study_options"] }>) {
  if (options.length === 0) return null;

  return (
    <ProfileSection icon={GraduationCap} title="Study Options" count={options.length}>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const mode = option.study_mode ? STUDY_MODE_LABEL[option.study_mode] ?? option.study_mode : null;
          const load = option.study_load ? STUDY_LOAD_LABEL[option.study_load] ?? option.study_load : null;
          return (
            <div key={option.id} className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-sm font-semibold text-foreground">
                {option.name || [mode, load].filter(Boolean).join(" · ") || "Study option"}
              </p>
              {option.name && (mode || load) && (
                <p className="mt-0.5 text-xs text-muted-foreground">{[mode, load].filter(Boolean).join(" · ")}</p>
              )}
              {option.duration_value != null && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {option.duration_value} {option.duration_unit ?? "months"}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </ProfileSection>
  );
}
