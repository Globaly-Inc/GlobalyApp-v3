import { STATUS_FILTERS, type StatusFilterKey } from "../const";


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

/**
 * How many enquiries each pill would show, from the server's per-status totals.
 *
 * Counted server-side rather than from the loaded rows: the list is paginated now, so counting
 * `items` would report "Active 3" when page one happens to hold three of them and there are forty.
 */
export function filterCounts(countsByStatus: Record<string, number>): Record<StatusFilterKey, number> {
  const total = Object.values(countsByStatus).reduce((sum, n) => sum + n, 0);
  const counts: Record<StatusFilterKey, number> = { all: total, active: 0, converted: 0, closed: 0 };
  for (const filter of STATUS_FILTERS) {
    if (!filter.statuses) continue;
    counts[filter.key] = filter.statuses.reduce((sum, status) => sum + (countsByStatus[status] ?? 0), 0);
  }
  return counts;
}

/** The raw statuses one pill covers, as the `status` query param. `all` sends nothing. */
export function statusParam(key: StatusFilterKey): string | undefined {
  return STATUS_FILTERS.find((f) => f.key === key)?.statuses?.join(",");
}
