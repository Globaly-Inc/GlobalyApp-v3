import { cn } from "@/lib/utils";
import { degreeBadge, type DegreeTone } from "../../utils";

const TONES: Record<DegreeTone, string> = {
  doctoral: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300",
  research: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
  postgrad: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
  undergrad: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  other: "bg-muted text-muted-foreground",
};

/** Mono degree tag (PhD / MRes / PG / UG…) that replaces the generic course icon. */
export function DegreeBadge({ level, fallback }: Readonly<{ level: string | null; fallback: React.ReactNode }>) {
  const badge = degreeBadge(level);
  return (
    <span
      title={level ?? undefined}
      className={cn(
        "flex h-8 w-10 shrink-0 items-center justify-center rounded-lg font-mono text-[10.5px] font-semibold transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover:scale-105",
        TONES[badge?.tone ?? "other"],
      )}
    >
      {badge?.label ?? fallback}
    </span>
  );
}
