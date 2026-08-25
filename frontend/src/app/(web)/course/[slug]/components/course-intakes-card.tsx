"use client";

import { useState } from "react";
import { CalendarCheck, CalendarClock, CalendarDays } from "lucide-react";
import { ProfileSection } from "../../../components/profile/profile-section";
import { MONTH_NAMES, type CourseDetail } from "../../../search/types";

type Intake = CourseDetail["intakes"][number];

function intakeLabel(intake: Intake) {
  if (intake.intake_name) return intake.intake_name;
  const start = intake.start_date ? new Date(intake.start_date) : null;
  const month = start ? MONTH_NAMES[start.getMonth()] : intake.intake_month ? MONTH_NAMES[intake.intake_month - 1] : null;
  const year = start ? start.getFullYear() : intake.intake_year;
  if (month && year) return `${month} ${year} Intake`;
  return year ? `${year} Intake` : "Intake TBC";
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

function Detail({
  icon: Icon, label, value,
}: Readonly<{ icon: typeof CalendarDays; label: string; value: string | null }>) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground">{value ?? "Not stated"}</p>
      </div>
    </div>
  );
}

/** One tab per intake, with that intake's dates spelled out underneath. */
export function CourseIntakesCard({ intakes }: Readonly<{ intakes: Intake[] }>) {
  const [activeId, setActiveId] = useState(intakes[0]?.id);
  const active = intakes.find((i) => i.id === activeId) ?? intakes[0];

  return (
    <ProfileSection icon={CalendarDays} title="Upcoming Intakes" count={intakes.length || undefined}>
      {!active ? (
        <p className="text-sm italic text-muted-foreground">No intakes configured yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {intakes.map((intake) => (
              <button
                key={intake.id}
                type="button"
                onClick={() => setActiveId(intake.id)}
                className={`shrink-0 rounded-lg border px-4 py-2 text-xs font-medium transition-colors ${
                  intake.id === active.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                {intakeLabel(intake)}
              </button>
            ))}
          </div>

          <div className="grid gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-3">
            <Detail icon={CalendarDays} label="Intake starts" value={formatDate(active.start_date)} />
            <Detail icon={CalendarCheck} label="Application deadline" value={formatDate(active.admission_deadline)} />
            <Detail
              icon={CalendarClock}
              label="Intake"
              value={active.intake_month && active.intake_year
                ? `${MONTH_NAMES[active.intake_month - 1]} ${active.intake_year}`
                : active.intake_year ? String(active.intake_year) : null}
            />
          </div>
        </div>
      )}
    </ProfileSection>
  );
}
