// .ts extension so tests/course-price.ts can load this module under node --strip-types
// (see allowImportingTsExtensions in tsconfig.json).
import { DEFAULT_FEE_PERIOD, MONTH_NAMES, type FeePeriod, type SearchCourse } from "./types.ts";

/** "4 Years Full-Time" / "6 Months Part-Time" — weeks are how extraction stores duration. */
export function formatDuration(weeks: number | null, studyMode: string | null): string | null {
  if (!weeks) return null;
  const years = weeks / 52;
  const span = years >= 1
    ? `${Math.round(years * 10) / 10} Year${years === 1 ? "" : "s"}`
    : `${Math.max(1, Math.round(weeks / 4.345))} Months`;
  const mode = studyMode?.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("-");
  return mode ? `${span} ${mode}` : span;
}

/** "Jan 2027", or just the year when extraction didn't capture a month. */
export function formatNextIntake(year: number | null, month: number | null): string {
  if (!year) return "Intake TBC";
  return month ? `${MONTH_NAMES[month - 1]} ${year}` : String(year);
}

/** Numbers, not a formatted string — the caller runs them through amountLabel. */
export type CoursePrice = { label: string; amount: number; currency: string };

/**
 * What a stored fee figure actually covers.
 *
 * A linked fee row carries its own period — the admin picks from "Per Year", "Per Semester",
 * "Per Trimester", "Per Unit", "Total" (PERIOD_TYPE_OPTIONS), and the column defaults to
 * "Per Year". The course-level fee columns predate those rows and hold a course total, so a
 * course with no linked fee has no period and keeps that reading.
 */
type FeeBasis = { kind: "total" | "year" | "term"; label: string };

function feeBasis(period: string | null | undefined): FeeBasis {
  const raw = period?.trim();
  if (!raw || /^total$/i.test(raw)) return { kind: "total", label: "Total Tuition" };
  if (/year/i.test(raw)) return { kind: "year", label: "Per Year" };
  // "Per Semester"/"Per Trimester" — and "Per Unit" or anything typed by hand, where the number
  // of terms or units is nowhere in the data, so the figure can only be shown as quoted.
  return { kind: "term", label: raw };
}

/**
 * The card shows one headline figure, in whichever period the Course Fee control asks for.
 * Domestic fees win over international when present, matching the search filters.
 *
 * The label always states what the number actually is. Only a course total can be split into a
 * per-year or per-installment figure: dividing a fee already quoted per year by the course length
 * showed a three-year degree at a third of its annual tuition, while the detail page — which
 * states the fee's own period — showed the real one.
 */
export function coursePrice(course: SearchCourse, period: FeePeriod = DEFAULT_FEE_PERIOD): CoursePrice | null {
  const useDomestic = course.domestic_fee_total != null;
  const currency = (useDomestic ? course.domestic_currency : course.international_currency) ?? "";
  const installment = useDomestic ? course.domestic_fee_installment : course.international_fee_installment;
  const quoted = useDomestic ? course.domestic_fee_total : course.international_fee_total;
  const basis = feeBasis(useDomestic ? course.domestic_fee_period : course.international_fee_period);

  const format = (label: string, value: number): CoursePrice => ({ label, amount: value, currency });

  // No fee, or a zero one: `Number(null)` is 0, which is how a course with nothing captured came
  // to advertise "0 · Total Tuition" instead of "On enquiry". A zero amount means not captured
  // rather than free — the same reading listCourseFacets takes with its nullif.
  const total = Number(quoted);
  if (quoted == null || quoted === "" || !Number.isFinite(total) || total === 0) return null;

  const years = (course.duration_weeks ?? 0) / 52;

  if (basis.kind === "total") {
    if (period === "per_semester" && installment != null) {
      const n = Number(installment);
      if (!Number.isNaN(n)) return format("Per Semester", n);
    }
    if (period === "per_year" && years >= 1) return format("Per Year", total / years);
    return format("Total Tuition", total);
  }

  // Multiplying a yearly fee out over a known course length is the one conversion left that is
  // arithmetic rather than a guess about how many terms a year holds.
  if (basis.kind === "year" && period === "total" && years >= 1) {
    return format("Total Tuition", total * years);
  }

  return format(basis.label, total);
}
