import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { CountUp } from "@/components/count-up";
import { cn } from "@/lib/utils";
import { IntakeDateTile, type TileParts } from "./intake-date-tile";

export type Countdown = {
  deadlineLabel: string;
  /** null once the deadline has passed. */
  daysLeft: number | null;
  /** 0–100: share of the last 90 days before the deadline already gone. */
  windowPct: number;
  windowStartLabel: string;
};

/** Hero card for the next upcoming intake: big date tile, application status, dates, and —
 * when it has an admission deadline — a days-left countdown plus a 90-day run-up bar. */
export function NextIntakeCard({
  name,
  parts,
  dateLine,
  countdown,
  onEdit,
  onDelete,
}: Readonly<{
  name: string;
  parts: TileParts | null;
  dateLine: string;
  countdown: Countdown | null;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}>) {
  const open = countdown?.daysLeft != null;
  return (
    <div className="group/next grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-[18px] gap-y-4 rounded-2xl border border-primary/25 bg-[linear-gradient(120deg,color-mix(in_oklab,var(--primary)_10%,var(--card)),var(--card)_70%)] p-[18px] sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <IntakeDateTile parts={parts} large />
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          {countdown ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                open ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground",
              )}
            >
              {open ? "Applications open" : "Applications closed"}
            </span>
          ) : (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Next intake</span>
          )}
          <div className="flex items-center gap-1 opacity-55 transition-opacity group-focus-within/next:opacity-100 group-hover/next:opacity-100">
            <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label="Edit intake">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <ConfirmDeleteButton onConfirm={onDelete} label="Delete intake" />
          </div>
        </div>
        <h3 className="mt-1 mb-0.5 truncate text-[17px] font-bold">{name}</h3>
        <p className="text-xs text-muted-foreground">{dateLine}</p>
      </div>

      {countdown && (
        <div className="col-span-full text-left sm:col-span-1 sm:text-right">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {open ? "Apply by" : "Closed"} {countdown.deadlineLabel}
          </p>
          {open && (
            <p className="text-primary">
              <span className="text-3xl font-bold">
                <CountUp value={countdown.daysLeft ?? 0} />
              </span>
              <span className="ml-1.5 text-xs font-medium text-muted-foreground">{countdown.daysLeft === 1 ? "day left" : "days left"}</span>
            </p>
          )}
        </div>
      )}

      {open && countdown && (
        <div className="col-span-full flex flex-col gap-1.5 pt-3">
          <div className="relative h-2 rounded-full bg-border">
            <span
              className="animate-fill-x absolute inset-y-0 left-0 rounded-full bg-primary"
              style={{ width: `${countdown.windowPct}%`, "--fill-delay": "300ms" } as React.CSSProperties}
            />
            <span className="absolute -top-[5px] h-[18px] w-0.5 rounded-sm bg-foreground" style={{ left: `${countdown.windowPct}%` }}>
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 font-mono text-[10px] font-semibold">Today</span>
            </span>
          </div>
          <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
            <span>{countdown.windowStartLabel}</span>
            <span>Deadline {countdown.deadlineLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}
