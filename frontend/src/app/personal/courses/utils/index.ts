import type { Course } from "../apis/types";

export const NOT_LISTED = "—";

/**
 * Annual tuition to display: international first, then domestic. Returns null
 * when neither parses to a finite number — which is every course in live data
 * today (both fee columns are NULL on all extracted rows), so the caller must
 * handle null rather than rendering "AUD null".
 */
export function courseFee(course: Course): { amount: number; currency: string } | null {
  const candidates: Array<[string | null, string | null]> = [
    [course.international_fee_total, course.international_currency],
    [course.domestic_fee_total, course.domestic_currency],
  ];
  for (const [total, currency] of candidates) {
    if (total === null) continue;
    const amount = Number(total);
    if (Number.isFinite(amount) && amount > 0) {
      return { amount, currency: currency ?? "" };
    }
  }
  return null;
}

export function formatFee(fee: { amount: number; currency: string }): string {
  return `${fee.currency} ${fee.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`.trim();
}

/** Extracted data stores duration in weeks; show whole years once it's a clean multiple. */
export function formatDuration(weeks: number | null): string {
  if (weeks === null || !Number.isFinite(weeks) || weeks <= 0) return NOT_LISTED;
  if (weeks % 52 === 0) {
    const years = weeks / 52;
    return `${years} ${years === 1 ? "year" : "years"}`;
  }
  return `${weeks} weeks`;
}
