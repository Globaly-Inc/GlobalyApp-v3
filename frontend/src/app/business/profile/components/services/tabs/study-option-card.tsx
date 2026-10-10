import { Building2, Laptop, MonitorSmartphone, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { cn } from "@/lib/utils";
import type { ServiceStudyOption } from "../../../apis/types";

const MODES = {
  on_campus: { label: "On campus", icon: Building2 },
  online: { label: "Online", icon: Laptop },
  hybrid: { label: "Hybrid", icon: MonitorSmartphone },
} as const;
const LOAD_LABELS: Record<string, string> = { full_time: "Full-time", part_time: "Part-time" };
const APPLICABLE: Record<string, { label: string; className: string }> = {
  both: { label: "All students", className: "bg-primary/10 text-primary" },
  domestic: { label: "Domestic", className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" },
  international: { label: "International", className: "bg-violet-500/12 text-violet-700 dark:text-violet-400" },
};

/** One way to study the course: mode tile, load, a duration bar scaled against the longest
 * option (`durationPct`, null when no duration is set), who it applies to, and actions. */
export function StudyOptionCard({
  option,
  durationPct,
  fillDelayMs,
  onEdit,
  onDelete,
}: Readonly<{ option: ServiceStudyOption; durationPct: number | null; fillDelayMs: number; onEdit: () => void; onDelete: () => Promise<void> }>) {
  const mode = MODES[option.study_mode] ?? { label: "Study option", icon: Building2 };
  const ModeIcon = mode.icon;
  const applicable = APPLICABLE[option.applicable_to];
  return (
    <article className="group/so flex flex-col gap-3 rounded-[14px] border bg-card p-4 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-px hover:border-primary/25 hover:shadow-[0_10px_28px_-16px_color-mix(in_oklab,var(--primary)_45%,transparent)]">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover/so:-rotate-6 group-hover/so:scale-105">
          <ModeIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">{mode.label}</p>
          <p className="text-xs text-muted-foreground">{LOAD_LABELS[option.study_load] ?? "—"}</p>
        </div>
        <div className="flex items-center gap-1 opacity-55 transition-opacity group-focus-within/so:opacity-100 group-hover/so:opacity-100">
          <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label="Edit study option">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <ConfirmDeleteButton onConfirm={onDelete} label="Delete study option" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
          <span>Duration</span>
          <span className="font-semibold text-foreground">{option.duration_value ? `${option.duration_value} ${option.duration_unit}` : "Not set"}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-border">
          {durationPct != null && (
            <span
              className="animate-fill-x block h-full rounded-full bg-gradient-to-r from-primary to-primary/60"
              style={{ width: `${durationPct}%`, "--fill-delay": `${fillDelayMs}ms` } as React.CSSProperties}
            />
          )}
        </div>
      </div>

      {applicable && (
        <span className={cn("self-start rounded-full px-2 py-0.5 text-[11px] font-semibold", applicable.className)}>{applicable.label}</span>
      )}
    </article>
  );
}
