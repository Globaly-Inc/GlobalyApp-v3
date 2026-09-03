import { DEFAULT_FEE_PERIOD, MONTH_NAMES, type FeePeriod, type SearchCourse } from "./types";

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

export type CoursePrice = { label: string; amount: string };

/**
 * The card shows one headline figure, in whichever period the Course Fee control asks for.
 * Domestic fees win over international when present, matching the search filters.
 *
 * The label always states what the number actually is: a course with no installment schedule
 * or no duration can't honour "Per Semester"/"Per Year", so it falls back to the total and says
 * so rather than mislabelling the figure.
 */
export function coursePrice(course: SearchCourse, period: FeePeriod = DEFAULT_FEE_PERIOD): CoursePrice | null {
  const useDomestic = course.domestic_fee_total != null;
  const currency = (useDomestic ? course.domestic_currency : course.international_currency) ?? "";
  const installment = useDomestic ? course.domestic_fee_installment : course.international_fee_installment;
  const total = Number(useDomestic ? course.domestic_fee_total : course.international_fee_total);

  const format = (label: string, value: number): CoursePrice => ({
    label,
    amount: `${currency} ${Math.round(value).toLocaleString()}`.trim(),
  });

  if (period === "per_semester" && installment != null) {
    const n = Number(installment);
    if (!Number.isNaN(n)) return format("Per Semester", n);
  }

  if (Number.isNaN(total) || !Number.isFinite(total)) return null;

  if (period === "per_year") {
    const years = (course.duration_weeks ?? 0) / 52;
    if (years >= 1) return format("Per Year", total / years);
  }

  return format("Total Tuition", total);
}
