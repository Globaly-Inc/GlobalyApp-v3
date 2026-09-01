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
/**
 * Counted from the server's per-status totals rather than the loaded rows — the inbox is paginated
 * now, so counting `items` would report "New 3" whenever page one holds three of them.
 */
export function filterCounts(countsByStatus: Record<string, number>): Record<InboxFilterKey, number> {
  const counts: Record<InboxFilterKey, number> = { new: 0, unlocked: 0, closed: 0 };
  for (const filter of INBOX_FILTERS) {
    counts[filter.key] = filter.statuses.reduce((sum, status) => sum + (countsByStatus[status] ?? 0), 0);
  }
  return counts;
}

/** The raw statuses one pill covers, as the `status` query param. */
export function statusParam(key: InboxFilterKey): string | undefined {
  return INBOX_FILTERS.find((f) => f.key === key)?.statuses?.join(",");
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
