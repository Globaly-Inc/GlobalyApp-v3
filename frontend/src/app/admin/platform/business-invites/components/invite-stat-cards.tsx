"use client";

import { cn } from "@/lib/utils";
import { STATUS_BADGE } from "../const";
import type { InviteCounts, InviteStatus } from "../apis/types";

const ORDER: readonly (InviteStatus | "all")[] = ["all", "pending", "accepted", "expired", "revoked"];

/** Counts that double as the status filter: click a card to filter by it, click it again to clear. */
export function InviteStatCards({
  counts, value, onChange, loading,
}: Readonly<{ counts: InviteCounts; value: InviteStatus | "all"; onChange: (value: InviteStatus | "all") => void; loading: boolean }>) {
  return (
    <div className={cn("mb-5 grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 lg:grid-cols-5", loading && "opacity-60")}>
      {ORDER.map((status) => {
        const active = value === status;
        const label = status === "all" ? "All" : STATUS_BADGE[status].label;
        const count = status === "all" ? counts.pending + counts.accepted + counts.expired + counts.revoked : counts[status];
        return (
          <button
            key={status}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? "all" : status)}
            className={cn(
              "flex cursor-pointer flex-col gap-1 rounded-xl border bg-card px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:bg-muted/50",
            )}
          >
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <span aria-hidden className={cn("h-2 w-2 rounded-full", status === "all" ? "bg-primary" : STATUS_BADGE[status].dot)} />
              {label}
            </span>
            <span className="text-2xl font-semibold tabular-nums text-foreground">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
