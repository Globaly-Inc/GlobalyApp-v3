import { CountUp } from "@/components/count-up";
import { cn } from "@/lib/utils";

/** One summary tile: big heading-font number (counts up) over a small label. `warn` = amber. */
export function PortalStatTile({ value, label, warn }: Readonly<{ value: number; label: string; warn?: boolean }>) {
  return (
    <div className={cn("grid gap-0.5 rounded-[14px] px-3.5 py-3 transition-transform hover:-translate-y-0.5", warn ? "bg-amber-500/10" : "bg-muted/60")}>
      <span className={cn("font-heading text-[22px] font-bold leading-tight tabular-nums", warn && "text-amber-700 dark:text-amber-300")}>
        <CountUp value={value} />
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
