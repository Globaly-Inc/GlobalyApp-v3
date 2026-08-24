import { INBOX_FILTERS, type InboxFilterKey } from "../const";

import type { DistributionListItem } from "../apis/types";

/** "23 Aug 2026" — the same short, unambiguous stamp the student enquiries list uses. */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

/** "February 2027 intake", or null when no month was chosen — the year alone says nothing. */
export function intakeLabel(intake: string | null, year: number | null): string | null {
  const month = intake?.trim();
  if (!month) return null;
  return `${month}${year ? ` ${year}` : ""} intake`;
}

/** Up to two initials for an avatar fallback. */
export function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** How many rows each filter pill would show. */
export function filterCounts(items: DistributionListItem[]): Record<InboxFilterKey, number> {
  const counts: Record<InboxFilterKey, number> = { new: 0, unlocked: 0, closed: 0 };
  for (const item of items) {
    for (const filter of INBOX_FILTERS) {
      if (filter.statuses.includes(item.status)) counts[filter.key] += 1;
    }
  }
  return counts;
}

/** The rows one filter pill shows, in the server's order. */
export function applyInboxFilter(items: DistributionListItem[], key: InboxFilterKey): DistributionListItem[] {
  const statuses = INBOX_FILTERS.find((f) => f.key === key)?.statuses;
  if (!statuses) return items;
  return items.filter((item) => statuses.includes(item.status));
}

/**
 * Which pill to land on. With no "All" tab, defaulting to a fixed one would show an empty
 * list to an agent whose leads happen to be all unlocked — so the first bucket that
 * actually has rows wins. Falls back to New, which is where a lead starts.
 */
export function defaultFilter(counts: Record<InboxFilterKey, number>): InboxFilterKey {
  return INBOX_FILTERS.find((f) => counts[f.key] > 0)?.key ?? "new";
}
