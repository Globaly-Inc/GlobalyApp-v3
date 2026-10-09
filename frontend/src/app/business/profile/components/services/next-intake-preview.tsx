import type { ServiceIntake } from "../../apis/types";

const DAY = 86_400_000;
const nice = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** When an intake starts and until when it still counts as upcoming. Same fallback as the Intakes
 * tab: an exact start_date, else intake_month/intake_year (institution intakes are often month-only),
 * which stays upcoming until that month ends. Null when the intake has no date at all. */
function startWindow(i: ServiceIntake): { start: Date; until: Date; exact: boolean } | null {
  if (i.start_date) {
    const start = new Date(i.start_date);
    return { start, until: start, exact: true };
  }
  if (!i.intake_year) return null;
  const month = (i.intake_month ?? 1) - 1;
  return { start: new Date(i.intake_year, month, 1), until: new Date(i.intake_year, i.intake_month ? month + 1 : 12, 0), exact: false };
}

/** The soonest upcoming intake as a date tile + name + "Apply by … · N days left";
 * "No upcoming intake" when every dated intake has already started. */
export function NextIntakePreview({ intakes }: Readonly<{ intakes: ServiceIntake[] }>) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = intakes
    .map((intake) => ({ intake, w: startWindow(intake) }))
    .filter((x): x is { intake: ServiceIntake; w: NonNullable<ReturnType<typeof startWindow>> } => !!x.w && x.w.until >= today)
    .sort((a, b) => a.w.start.getTime() - b.w.start.getTime())[0];

  if (!next) return <p className="text-sm text-muted-foreground">No upcoming intake</p>;

  const { start, exact } = next.w;
  const intake = next.intake;
  const deadline = intake.admission_deadline ? new Date(intake.admission_deadline) : null;
  const daysLeft = deadline ? Math.ceil((deadline.getTime() - today.getTime()) / DAY) : null;
  return (
    <div className="flex items-center gap-3">
      <div className="w-11 shrink-0 rounded-[10px] bg-primary py-1 text-center leading-tight text-primary-foreground">
        <div className="font-mono text-[10px] font-semibold tracking-[.06em] opacity-85">{start.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</div>
        {exact ? (
          <>
            <div className="text-[17px] font-bold">{start.getDate()}</div>
            <div className="font-mono text-[9.5px] opacity-75">{start.getFullYear()}</div>
          </>
        ) : (
          <div className="pb-0.5 text-[15px] font-bold">{start.getFullYear()}</div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold">{intake.intake_name || "Unnamed intake"}</p>
        {deadline && daysLeft != null && (
          <p className="text-xs text-muted-foreground">
            Apply by {nice(deadline)} ·{" "}
            <strong className={daysLeft >= 0 ? "text-primary" : "text-muted-foreground"}>
              {daysLeft >= 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : "Applications closed"}
            </strong>
          </p>
        )}
      </div>
    </div>
  );
}
