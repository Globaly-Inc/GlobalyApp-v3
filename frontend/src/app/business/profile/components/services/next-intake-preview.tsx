import type { ServiceIntake } from "../../apis/types";

const DAY = 86_400_000;
const nice = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The soonest upcoming intake as a date tile + name + "Apply by … · N days left";
 * "No upcoming intake" when every dated intake has already started. */
export function NextIntakePreview({ intakes }: Readonly<{ intakes: ServiceIntake[] }>) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = intakes
    .filter((i) => i.start_date && new Date(i.start_date) >= today)
    .sort((a, b) => new Date(a.start_date!).getTime() - new Date(b.start_date!).getTime())[0];

  if (!next) return <p className="text-sm text-muted-foreground">No upcoming intake</p>;

  const start = new Date(next.start_date!);
  const deadline = next.admission_deadline ? new Date(next.admission_deadline) : null;
  const daysLeft = deadline ? Math.ceil((deadline.getTime() - today.getTime()) / DAY) : null;
  return (
    <div className="flex items-center gap-3">
      <div className="w-11 shrink-0 rounded-[10px] bg-primary py-1 text-center leading-tight text-primary-foreground">
        <div className="font-mono text-[10px] font-semibold tracking-[.06em] opacity-85">{start.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</div>
        <div className="text-[17px] font-bold">{start.getDate()}</div>
        <div className="font-mono text-[9.5px] opacity-75">{start.getFullYear()}</div>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold">{next.intake_name || "Unnamed intake"}</p>
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
