/**
 * Pure checks for `coursePrice` — the headline fee on every course card, tile and stats strip.
 *
 * A linked fee row carries its own period, so the figure is not always a course total: dividing a
 * fee already quoted "Per Year" by the course length once showed a three-year degree at a third of
 * its annual tuition, while the detail page showed the real one. These pin which conversions are
 * allowed and which figures are shown as quoted.
 * Run: node tests/course-price.ts   (Node strips the types; no test framework needed)
 */

import assert from "node:assert/strict";
import { coursePrice } from "../src/app/(web)/search/course-card-utils.ts";
import type { SearchCourse } from "../src/app/(web)/search/types.ts";

/** A three-year course, fee quoted however the caller says. */
const course = (fee: Partial<SearchCourse>): SearchCourse => ({
  id: "c1", name: "Test", short_name: null, degree_level: "bachelor", subject_area: null,
  duration_weeks: 156, study_mode: null, description: null,
  domestic_fee_total: null, domestic_currency: null,
  international_fee_total: null, international_currency: null,
  awarding_institution: null, image_url: null, country_name: null,
  next_intake_year: null, next_intake_month: null, slug: "test-abc123", country_code: null,
  institution_logo_url: null, campus_locations: [],
  domestic_fee_installment: null, international_fee_installment: null,
  ...fee,
});

const annual = course({ domestic_fee_total: "47388", domestic_currency: "AUD", domestic_fee_period: "Per Year" });
const whole = course({ domestic_fee_total: "142164", domestic_currency: "AUD", domestic_fee_period: "Total" });
const legacy = course({ domestic_fee_total: "142164", domestic_currency: "AUD" });
const perTerm = course({ domestic_fee_total: "23694", domestic_currency: "AUD", domestic_fee_period: "Per Semester" });

// ── A fee already quoted per year is never divided again ──
assert.deepEqual(coursePrice(annual, "per_year"), { label: "Per Year", amount: 47388, currency: "AUD" });
// …and the default view says what it is rather than calling it the course total.
assert.deepEqual(coursePrice(annual), { label: "Per Year", amount: 47388, currency: "AUD" });
// Multiplying out over a known course length is arithmetic, so the total view may do it.
assert.deepEqual(coursePrice(annual, "total"), { label: "Total Tuition", amount: 142164, currency: "AUD" });

// ── A course total still splits per year ──
assert.deepEqual(coursePrice(whole, "per_year"), { label: "Per Year", amount: 47388, currency: "AUD" });
assert.deepEqual(coursePrice(whole, "total"), { label: "Total Tuition", amount: 142164, currency: "AUD" });

// A course with no linked fee has no period: the fee columns predate them and are course totals.
assert.deepEqual(coursePrice(legacy, "per_year"), { label: "Per Year", amount: 47388, currency: "AUD" });

// A course total with no duration can't be split — it says so instead of guessing.
assert.deepEqual(
  coursePrice(course({ domestic_fee_total: "142164", domestic_currency: "AUD", duration_weeks: null }), "per_year"),
  { label: "Total Tuition", amount: 142164, currency: "AUD" },
);

// ── A term fee is shown as quoted: nothing in the data says how many terms a year holds ──
for (const view of ["per_year", "total", "per_semester"] as const) {
  assert.deepEqual(
    coursePrice(perTerm, view),
    { label: "Per Semester", amount: 23694, currency: "AUD" },
    `a per-semester fee must not be converted for the ${view} view`,
  );
}
// An admin-typed period the data can't convert keeps its own label.
assert.equal(
  coursePrice(course({ domestic_fee_total: "1200", domestic_currency: "AUD", domestic_fee_period: "Per Unit" }), "total")?.label,
  "Per Unit",
);

// ── Unchanged: a real installment schedule wins the per-semester view for a course total ──
assert.deepEqual(
  coursePrice(course({
    domestic_fee_total: "142164", domestic_currency: "AUD", domestic_fee_period: "Total",
    domestic_fee_installment: "23694",
  }), "per_semester"),
  { label: "Per Semester", amount: 23694, currency: "AUD" },
);

// International fees stand in when there is no domestic one.
assert.deepEqual(
  coursePrice(course({ international_fee_total: "96000", international_currency: "AUD", international_fee_period: "Per Year" })),
  { label: "Per Year", amount: 96000, currency: "AUD" },
);

// No fee, or a zero one. Number(null) is 0, which is how a course with nothing captured came to
// advertise "0 · Total Tuition"; a zero amount reads as not captured, not free.
assert.equal(coursePrice(course({})), null);
assert.equal(coursePrice(course({ domestic_fee_total: "0", domestic_currency: "AUD" })), null);
assert.equal(coursePrice(course({ domestic_fee_total: "", domestic_currency: "AUD" })), null);

console.log("course-price: all assertions passed");
