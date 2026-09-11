"use client";

import { useState } from "react";
import { CalendarCheck, CalendarClock, CalendarDays } from "lucide-react";
import { ScrollRow } from "@/components/scroll-row";
import { ProfileSection } from "../../../components/profile/profile-section";
import { MONTH_NAMES, type CourseDetail } from "../../../search/types";

type Intake = CourseDetail["intakes"][number];

function intakeLabel(intake: Intake) {
  if (intake.intake_name) return intake.intake_name;
  // Read off the string, not through Date(): a month-only "2026-09" parses as UTC midnight on the
  // 1st, so getMonth()/getFullYear() shift a month (and a year, each January) for any visitor in a
  // timezone behind UTC.
  const parts = intake.start_date?.match(/^(\d{4})-(\d{2})/);
  const month = parts ? MONTH_NAMES[Number(parts[2]) - 1] : intake.intake_month ? MONTH_NAMES[intake.intake_month - 1] : null;
  const year = parts ? Number(parts[1]) : intake.intake_year;
  if (month && year) return `${month} ${year} Intake`;
  return year ? `${year} Intake` : "Intake TBC";
}

/**
 * An intake date at the precision the institution published it.
 *
 * A value can be "2026-09-21" or "2026-09" — universities publish both, and the pipeline no longer
 * turns the second into "2026-09-01". Formatted from the string rather than through Date():
 * toLocaleDateString on a month-only value renders "1 September 2026", putting an application
 * deadline on this page that nobody set.
 */
function formatDate(value: string | null) {
  const parts = value?.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!parts) return null;
  const [, year, month, day] = parts;
  const name = MONTH_NAMES[Number(month) - 1] ?? month;
  return day ? `${Number(day)} ${name} ${year}` : `${name} ${year}`;
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
          <ScrollRow className="-mx-1" rowClassName="flex gap-2 px-1 pb-1">
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
          </ScrollRow>

          <div className="grid gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-3">
            <Detail icon={CalendarDays} label="Intake starts" value={formatDate(active.start_date)} />
            <Detail icon={CalendarCheck} label="Application deadline" value={formatDate(active.admission_deadline)} />
            {/* No fallback to intake_month/intake_year: those describe when the intake *starts*
                (the extractor writes them next to start_date), so using them here reported a
                start date as the end date, contradicting "Intake starts" beside it. */}
            <Detail icon={CalendarClock} label="Intake ends" value={formatDate(active.end_date)} />
          </div>
        </div>
      )}
    </ProfileSection>
  );
}
