import { cn } from "@/lib/utils";
import { degreeBadge, type DegreeTone } from "../../utils";

const TONES: Record<DegreeTone, string> = {
  doctoral: "bg-warning/15 text-warning",
  research: "bg-chart-4/15 text-chart-4",
  postgrad: "bg-info/15 text-info",
  undergrad: "bg-success/15 text-success",
  other: "bg-muted text-muted-foreground",
};

/** Mono degree tag (PhD / MRes / PG / UG…) that replaces the generic course icon. */
export function DegreeBadge({ level, fallback }: Readonly<{ level: string | null; fallback: React.ReactNode }>) {
  const badge = degreeBadge(level);
  return (
    <span
      title={level ?? undefined}
      className={cn(
        "flex h-[30px] w-10 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-semibold transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover/row:scale-105",
        TONES[badge?.tone ?? "other"],
      )}
    >
      {badge?.label ?? fallback}
    </span>
  );
}
