// Dates an institution states at two different precisions, kept at the precision it stated.
//
// Universities publish both: Stanford's calendar gives "September 21, 2026" for term start, while
// plenty of catalogues give only "September 2026" for a deadline. The old coerceDate turned the
// second into "2026-09-01" — a day the source never said, indistinguishable afterwards from a real
// 1 September. That is the defect this module exists to remove.
//
// The representation is ISO 8601 reduced precision: "2026-09-21" for a full date, "2026-09" for a
// month. Both sort correctly as text ("2026-09" < "2026-09-21" < "2026-10"), which is why the
// columns are text rather than `date` — a `date` column cannot hold a month without inventing a
// day, and inventing the day is the whole problem.
//
// The `type` the API and the form talk about is DERIVED from the value's shape rather than stored
// beside it. A second column would be free to disagree with the value it describes, and there is
// nothing it could express that the value does not already say.

/** What precision a stored value carries. Null when there is no value at all. */
export type DatePrecision = "full_date" | "month";

/** A full date, or a month with no day. Anything else is not a partial date. */
export const PARTIAL_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH_WORD = new RegExp(`\\b(${Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|")})\\b`, "i");

/** True for a value this module produced or would accept unchanged. */
export function isPartialDate(v: unknown): v is string {
  return typeof v === "string" && PARTIAL_DATE_RE.test(v);
}

/**
 * Shape AND calendar: `true` only for a value that names a real point in time.
 *
 * `isPartialDate` is shape-only, and so is the column's CHECK constraint — a regex cannot know that
 * February has no 31st, and Postgres offers no way to try a cast inside a CHECK. So calendar
 * validity is enforced in the application, and this is the single predicate that does it. The
 * write paths coerce (degrading a bad day to its month); the API validators reject, because an
 * admin who typed an impossible date should be told rather than quietly given a different value.
 */
export function isValidPartialDate(v: unknown): v is string {
  if (!isPartialDate(v)) return false;
  return v.length === 7 || isRealDate(v);
}

export function datePrecision(v: unknown): DatePrecision | null {
  if (!isPartialDate(v)) return null;
  return v.length === 7 ? "month" : "full_date";
}

/** The month component as "YYYY-MM", whatever the precision — for comparing across precisions. */
export function monthOf(v: unknown): string | null {
  return isPartialDate(v) ? v.slice(0, 7) : null;
}

/**
 * Whatever the model or the admin sent, at the precision it was actually stated.
 *
 * Never widens and never narrows: a day present in the input survives, a day absent from the input
 * is not manufactured. Returns null rather than guessing when there is no year, since a month with
 * no year cannot be placed on a calendar at all ("September" alone) — the intake's own
 * intake_month/intake_year still carry the season in that case.
 */
export function coercePartialDate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;

  // Already one of ours, or an ISO timestamp whose date half is. Taken verbatim — this is the path
  // every re-save of an unedited value takes, and it must be a no-op.
  const iso = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (iso) {
    if (iso[1] === "0000") return null;
    const month = `${iso[1]}-${iso[2]}`;
    if (!iso[3]) return PARTIAL_DATE_RE.test(month) ? month : null;
    const candidate = `${month}-${iso[3]}`;
    if (!PARTIAL_DATE_RE.test(candidate)) return null;
    // The calendar check applies HERE too, not only to the prose path below. This branch used to
    // return early on shape alone, so an ISO-shaped impossible date — "2026-02-31", which a model
    // does emit — was stored verbatim by every writer. The `date` column used to reject it; text
    // with a shape-only CHECK does not, so the check has to live here.
    //
    // Degraded to the month rather than dropped: the source clearly meant February 2026, and the
    // day is the only part that cannot be true. Same resolution as the prose path.
    return isRealDate(candidate) ? candidate : month;
  }

  const year = s.match(/\b(19|20)\d{2}\b/)?.[0];
  if (!year) return null;

  const monthWord = s.match(MONTH_WORD)?.[1]?.toLowerCase();
  const month = monthWord ? MONTHS[monthWord] : null;
  if (month == null) return null;

  // A day only counts when it is a number that is neither the year nor part of it. Ordinals
  // ("21st September 2026") and both comma styles are covered; a bare "September 2026" is not,
  // which is exactly the case that must stay month-precision.
  const withoutYear = s.replace(year, " ");
  const day = withoutYear.match(/\b(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\b/)?.[1];

  const mm = String(month).padStart(2, "0");
  if (!day) return `${year}-${mm}`;

  const dd = String(Number(day)).padStart(2, "0");
  const candidate = `${year}-${mm}-${dd}`;
  // Rejects 31 February rather than letting Date roll it into March.
  return isRealDate(candidate) ? candidate : `${year}-${mm}`;
}

function isRealDate(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Whether a stored value and an incoming one can be the same date, treating a missing side as
 * unknown rather than as a difference — the rule upsertIntake applies to decide whether two rows
 * are the same sitting.
 *
 * Across precisions this is deliberately lenient: "2026-09" and "2026-09-21" describe the same
 * intake, one of them more precisely. The caller keeps whichever is more precise.
 */
export function partialDatesAgree(stored: unknown, incoming: unknown): boolean {
  const a = normaliseStored(stored);
  const b = normaliseStored(incoming);
  if (a == null || b == null) return true;
  if (a.length === 7 || b.length === 7) return a.slice(0, 7) === b.slice(0, 7);
  return a === b;
}

/** The more precise of two values for the same field, or whichever one exists. */
export function morePrecise(a: unknown, b: unknown): string | null {
  const x = normaliseStored(a);
  const y = normaliseStored(b);
  if (x == null) return y;
  if (y == null) return x;
  return y.length > x.length ? y : x;
}

/**
 * A value read back from the database.
 *
 * The columns are text now, but rows written before that migration can still arrive as a `Date`
 * from pg (and a `date` column read through an older pool does), so both are accepted.
 */
export function normaliseStored(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  if (isPartialDate(s)) return s;
  return coercePartialDate(s);
}

/** How a value reads to a person: "September 2026" or "21 September 2026". */
export function formatPartialDate(v: unknown): string | null {
  const s = normaliseStored(v);
  if (!s) return null;
  const [y, m, d] = s.split("-");
  const name = Object.keys(MONTHS).find((k) => k.length > 3 && MONTHS[k] === Number(m));
  const month = name ? name[0].toUpperCase() + name.slice(1) : m;
  return d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}
