import { STATUS_FILTERS, type StatusFilterKey } from "../const";

import type { EnquiryListItem } from "../apis/types";

/** "23 Aug 2026" — same short, unambiguous stamp the earn/services feature uses. */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

/** "February 2027 intake", or null when no month was chosen — the year alone says nothing. */
export function intakeLabel(intake: string | null, year: number | null, suffix = " intake"): string | null {
  const month = intake?.trim();
  if (!month) return null;
  return `${month}${year ? ` ${year}` : ""}${suffix}`;
}

/** Up to two initials for an avatar fallback — same helper as the messages feature. */
export function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** 104 → "2 years", 78 → "78 weeks". Whole years only, since that's how a course is sold. */
export function durationLabel(weeks: number | null): string | null {
  if (!weeks || weeks <= 0) return null;
  if (weeks % 52 === 0) {
    const years = weeks / 52;
    return `${years} ${years === 1 ? "year" : "years"}`;
  }
  return `${weeks} weeks`;
}

/** "on-campus" → "On campus". Extracted study modes arrive lowercase and hyphenated. */
export function prettyMode(mode: string | null): string | null {
  if (!mode?.trim()) return null;
  const words = mode.replaceAll("-", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * "AUD 2,700" from the numeric-as-string totals the extraction pipeline produces.
 * No currency code means we can't name the unit, so the raw amount is all we may show.
 */
export function feeLabel(total: string | null, currency: string | null): string | null {
  if (!total) return null;
  const amount = Number(total);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!currency) return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // An unrecognised currency code must still render a number rather than throwing mid-render.
    return `${currency} ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount)}`;
  }
}

/** How many enquiries each list filter would show — the counts on the filter pills. */
export function filterCounts(items: EnquiryListItem[]): Record<StatusFilterKey, number> {
  const counts: Record<StatusFilterKey, number> = { all: items.length, active: 0, converted: 0, closed: 0 };
  for (const item of items) {
    for (const filter of STATUS_FILTERS) {
      if (filter.statuses?.includes(item.status)) counts[filter.key] += 1;
    }
  }
  return counts;
}

/** The items one filter pill shows. `all` keeps the server's order untouched. */
export function applyStatusFilter(items: EnquiryListItem[], key: StatusFilterKey): EnquiryListItem[] {
  const statuses = STATUS_FILTERS.find((f) => f.key === key)?.statuses;
  if (!statuses) return items;
  return items.filter((item) => statuses.includes(item.status));
}
