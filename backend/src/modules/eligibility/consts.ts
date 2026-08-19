// The eligibility vocabulary — V1's, unchanged.
//
// Both lists are copied verbatim from supabase/functions/check-eligibility/index.ts
// because they are a data contract, not a design choice: DEGREE_ORDER's ORDER is the
// whole of rule 1 (a degree is "enough" iff its index is >= the requirement's), and
// the three result strings are what V1 wrote into 3 live rows and what
// StudentEligibility.tsx keys its RESULT_CONFIG on. Re-deriving either would change
// the meaning of migrated data.

/**
 * V1's degree ladder, lowest first. `indexOf` IS the rank, so an unlisted or absent
 * level ranks -1 and can never satisfy a requirement — which is what V1 did.
 *
 * `other` sits at the TOP in V1's array. That reads wrong, and it is deliberately
 * NOT corrected here: three migrated rows and every future comparison must mean the
 * same thing before and after the migration. See the module README note in
 * lib/rules.ts.
 */
export const DEGREE_ORDER = [
  "certificate",
  "diploma",
  "associate",
  "bachelor",
  "graduate_certificate",
  "graduate_diploma",
  "master",
  "doctoral",
  "other",
] as const;

/** The three verdicts, and the CHECK constraint on student_eligibility_checks.result. */
export const ELIGIBILITY_RESULTS = ["eligible", "conditionally_eligible", "not_eligible"] as const;

export type EligibilityResult = (typeof ELIGIBILITY_RESULTS)[number];

/** V1's fallback when a service carries a price but no currency. */
export const DEFAULT_PRICE_CURRENCY = "AUD";

/**
 * The four English tests V1 compares, mapping the profile's `english_test_type`
 * (upper-cased) to the `category_specific_data` key holding that test's minimum.
 * A type absent from here, or present with no minimum on the service, passes —
 * V1's explicit else branch.
 */
export const ENGLISH_TEST_MINIMUMS: Readonly<Record<string, string>> = {
  IELTS: "min_ielts",
  TOEFL: "min_toefl",
  PTE: "min_pte",
  DUOLINGO: "min_duolingo",
};
