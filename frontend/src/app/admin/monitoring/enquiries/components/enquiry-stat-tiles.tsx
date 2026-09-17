"use client";

import { INBOX_FILTERS } from "../const";
import type { AdminEnquiryStats } from "../apis";

/** Statuses that mean the enquiry is still moving — the rest are outcomes. */
const IN_PROGRESS = ["pending", "distributed", "unlocked", "in_conversation"];

/** The same bucket the Closed pill filters by, so tile and pill can't drift apart. */
const CLOSED = INBOX_FILTERS.find((f) => f.key === "closed")?.statuses ?? [];

function countOf(stats: AdminEnquiryStats | null, statuses: readonly string[]): number {
  return (stats?.statuses ?? [])
    .filter((s) => statuses.includes(s.status))
    .reduce((sum, s) => sum + Number(s.count), 0);
}

/**
 * The funnel in three numbers: what came in, what someone paid for, what is finished.
 * Unlocks are the only point money changes hands, so the credit figure sits with them.
 */
export function EnquiryStatTiles({ stats }: Readonly<{ stats: AdminEnquiryStats | null }>) {
  const total = stats?.total ?? 0;
  const distributions = stats?.distributions.total ?? 0;
  const unlocked = stats?.distributions.unlocked ?? 0;
  const closed = countOf(stats, CLOSED);

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <Tile label="Enquiries" value={String(total)} hint={`${countOf(stats, IN_PROGRESS)} in progress`} />
      <Tile
        label="Unlocked"
        value={String(unlocked)}
        hint={`of ${distributions} sent to businesses · ${stats?.distributions.coins_spent ?? 0} credits spent`}
      />
      <Tile
        label="Closed"
        value={String(closed)}
        hint={`${countOf(stats, ["no_match"])} no match · ${countOf(stats, ["expired"])} expired`}
      />
    </div>
  );
}

function Tile({ label, value, hint }: Readonly<{ label: string; value: string; hint?: string }>) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
