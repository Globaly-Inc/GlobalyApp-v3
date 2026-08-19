// V1's eligibility rules, ported. Pure — no database, no clock, no I/O.
//
// PROVENANCE. The rules live in V1's `check-eligibility` edge function and nowhere
// else. Two decoys were ruled out first: `useVisaEligibilityMatch.ts` scores VISAS
// (a different feature, its own 0-100 score, never writes eligibility_checks), and
// the only Postgres RPC the function calls is `deduct_credits`. The inputs are the
// student's `profiles` row and the service's `category_specific_data` jsonb, which
// V3 migrates verbatim (scripts/migration/w7-services.ts).
//
// NO SCORE IS INVENTED. V1 produces three verdicts from two counters, and so does
// this. Every string below is byte-identical to V1's, because 3 migrated rows carry
// those exact strings in met_requirements/unmet_requirements and a read-parity diff
// compares them character for character.
//
// TWO V1 ODDITIES KEPT ON PURPOSE, both marked at their site:
//   - `other` is the HIGHEST degree rank (consts.ts).
//   - conditional flags are stored in `unmet_requirements` alongside hard failures;
//     only the `result` column distinguishes them.
//
// ONE V1 ODDITY THAT COULD NOT BE KEPT: rule 5 compared the service's free-text
// `country` against the profile's text[] of country NAMES. V3 has neither column —
// a service's country comes from its owning org's `country_id`, and
// platform_user_profiles.preferred_destinations is a jsonb array of country IDs
// (globalyapp/20260803_003). So the comparison is by id and the label is the
// country's name. Same rule, same output line, resolved through V3's vocabulary.

import {
  DEFAULT_PRICE_CURRENCY,
  DEGREE_ORDER,
  ENGLISH_TEST_MINIMUMS,
  type EligibilityResult,
} from "../consts.js";

export interface EligibilityProfile {
  highest_degree_level: string | null;
  gpa: number | null;
  english_test_type: string | null;
  english_test_score: number | null;
  budget_max: number | null;
  /** platform_user_profiles.preferred_destinations — country ids. */
  preferred_destination_ids: readonly number[];
}

export interface EligibilityService {
  price: number | null;
  price_currency: string | null;
  /** The owning org's country. V3 has no per-service country column. */
  country_id: number | null;
  country_name: string | null;
  /** business_services.category_specific_data, straight off the tenant row. */
  requirements: Record<string, unknown>;
}

export interface EligibilityVerdict {
  result: EligibilityResult;
  met_requirements: string[];
  /** Hard failures first, then conditional flags — V1's `[...unmet, ...flags]`. */
  unmet_requirements: string[];
  notes: string;
}

/** V1's `degreeRank`: position in the ladder, or -1 for null/unknown. */
export function degreeRank(level: string | null): number {
  if (!level) return -1;
  return (DEGREE_ORDER as readonly string[]).indexOf(level);
}

const label = (level: string): string => level.replace(/_/g, " ");

/**
 * A requirement value that is usable as a number.
 *
 * V1 read `csd.min_gpa` off untyped jsonb and compared it with `>=`, so a string
 * requirement silently produced `false` for every student. Here a non-numeric
 * requirement is treated as absent — the rule does not apply — rather than failing
 * every applicant on a data-entry mistake in one tenant's row.
 */
function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

/** V1 rendered money with `toLocaleString()`. Pinned to en-US so the server's locale cannot change stored text. */
const money = (n: number): string => n.toLocaleString("en-US");

export function evaluate(profile: EligibilityProfile, service: EligibilityService): EligibilityVerdict {
  // `category_specific_data` is jsonb: null, a scalar or an array are all reachable.
  const csd: Record<string, unknown> =
    service.requirements && typeof service.requirements === "object" && !Array.isArray(service.requirements)
      ? service.requirements
      : {};

  const met: string[] = [];
  const unmet: string[] = [];
  const conditional: string[] = [];

  // ── 1. minimum degree level ───────────────────────────────────────────────
  const minDegree = typeof csd.min_degree_level === "string" ? csd.min_degree_level : null;
  if (minDegree) {
    const studentRank = degreeRank(profile.highest_degree_level);
    const requiredRank = degreeRank(minDegree);
    if (studentRank < 0) {
      unmet.push(`Minimum degree level: ${label(minDegree)} (your degree level is not set)`);
    } else if (studentRank >= requiredRank) {
      met.push(`Degree level: ${label(profile.highest_degree_level!)} meets requirement of ${label(minDegree)}`);
    } else {
      unmet.push(
        `Minimum degree level: ${label(minDegree)} (you have: ${label(profile.highest_degree_level!)})`,
      );
    }
  }

  // ── 2. minimum GPA ────────────────────────────────────────────────────────
  // The one soft academic rule: a MISSING gpa is a flag ("add it to your profile"),
  // a LOW gpa is a hard failure.
  const minGpa = numeric(csd.min_gpa);
  if (minGpa !== null) {
    if (profile.gpa === null) {
      conditional.push(`GPA requirement: ${minGpa} (your GPA is not set - add it to your profile)`);
    } else if (profile.gpa >= minGpa) {
      met.push(`GPA: ${profile.gpa} meets minimum of ${minGpa}`);
    } else {
      unmet.push(`Minimum GPA: ${minGpa} (your GPA: ${profile.gpa})`);
    }
  }

  // ── 3. English language ───────────────────────────────────────────────────
  if (csd.english_test_required) {
    if (!profile.english_test_type || profile.english_test_score === null) {
      unmet.push("English language test score required (IELTS/TOEFL/PTE/Duolingo)");
    } else {
      const testType = profile.english_test_type.toUpperCase();
      const score = profile.english_test_score;
      const minimum = numeric(csd[ENGLISH_TEST_MINIMUMS[testType] ?? ""]);

      if (minimum === null) {
        // V1's else branch: an unrecognised test, or one the service set no bar for.
        met.push(`English test: ${testType} score: ${score} (no specific minimum set for ${testType})`);
      } else {
        const line = `English test: ${testType} ${score} (minimum: ${minimum})`;
        (score >= minimum ? met : unmet).push(line);
      }
    }
  } else {
    met.push("No English language test required for this service");
  }

  // ── 4. budget ─────────────────────────────────────────────────────────────
  // Advisory on both sides: over budget is a flag, never a refusal.
  if (service.price !== null && profile.budget_max !== null) {
    const currency = service.price_currency || DEFAULT_PRICE_CURRENCY;
    if (profile.budget_max >= service.price) {
      met.push(`Budget: ${currency} ${money(service.price)} is within your budget`);
    } else {
      conditional.push(
        `Budget: Fee ${currency} ${money(service.price)} may exceed your stated budget of ` +
          `${currency} ${money(profile.budget_max)}`,
      );
    }
  }

  // ── 5. destination preference ─────────────────────────────────────────────
  // A match is a bonus line. A mismatch adds NOTHING — V1 never penalised it, and
  // adding a penalty here would change 3 migrated verdicts.
  if (service.country_id !== null && profile.preferred_destination_ids.length > 0) {
    if (profile.preferred_destination_ids.includes(service.country_id)) {
      met.push(`${service.country_name ?? service.country_id} is one of your preferred destinations`);
    }
  }

  // ── the verdict ───────────────────────────────────────────────────────────
  let result: EligibilityResult;
  let notes: string;
  if (unmet.length === 0 && conditional.length === 0) {
    result = "eligible";
    notes = "You meet all the requirements. You can proceed with your application!";
  } else if (unmet.length === 0) {
    result = "conditionally_eligible";
    notes = "You meet the core requirements but there are some items to consider before applying.";
  } else {
    result = "not_eligible";
    notes = `You do not currently meet ${unmet.length} requirement(s).`;
  }

  return { result, met_requirements: met, unmet_requirements: [...unmet, ...conditional], notes };
}
