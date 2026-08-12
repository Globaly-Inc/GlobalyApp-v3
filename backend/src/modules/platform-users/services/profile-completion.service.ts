// Profile completion — THE single definition. Nothing else may compute it.
//
// The percentage gates enquiries, so it is never computable client-side: the frontend displays what this
// returns and nothing more. The badges are derived in the same pass as the score, so a "all badges green
// but 80%" disagreement is structurally impossible (that was the V2 defect — its SQL scored qualification
// rows while the UI badges read profile columns, and its max reachable score was 9/10 so the card never
// disappeared).

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";

export type CompletionBadge = { key: string; label: string; done: boolean };
export type Completion = { percentage: number; badges: CompletionBadge[] };

/** Total weight. Every point below must be reachable — tests assert a fully-filled profile hits 100. */
const TOTAL_POINTS = 10;

type CompletionInputs = {
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  nationality_id: number | null;
  country_of_residence_id: number | null;
  budget_min: number | null;
  budget_max: number | null;
  preferred_destinations: unknown;
  qualification_count: number;
  language_test_count: number;
};

function hasDestinations(value: unknown): boolean {
  // jsonb column — knex may hand back an array or a JSON string depending on driver/version.
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

/** Pure scoring — the same inputs always yield the same score and badges. Exported for the self-check. */
export function scoreCompletion(input: CompletionInputs): Completion {
  const nameDone = !!(input.first_name && input.last_name);
  const nationalityDone = input.nationality_id != null;
  const residenceDone = input.country_of_residence_id != null;
  const qualificationsDone = input.qualification_count > 0;
  const languageTestsDone = input.language_test_count > 0;
  const budgetDone = input.budget_min != null && input.budget_max != null;
  const destinationsDone = hasDestinations(input.preferred_destinations);
  const photoDone = !!input.photo_url;

  // weight → point value. Qualifications are worth 3; everything else 1. Sums to TOTAL_POINTS.
  const score =
    (nameDone ? 1 : 0) +
    (nationalityDone ? 1 : 0) +
    (residenceDone ? 1 : 0) +
    (qualificationsDone ? 3 : 0) +
    (languageTestsDone ? 1 : 0) +
    (budgetDone ? 1 : 0) +
    (destinationsDone ? 1 : 0) +
    (photoDone ? 1 : 0);

  // The five badges the UI shows, each derived from the same booleans that produced the score.
  const badges: CompletionBadge[] = [
    { key: "personal_info", label: "Personal info", done: nameDone && nationalityDone && residenceDone },
    { key: "education_history", label: "Education history", done: qualificationsDone },
    { key: "english_scores", label: "English scores", done: languageTestsDone },
    { key: "preferences", label: "Preferences", done: budgetDone && destinationsDone },
    { key: "profile_photo", label: "Profile photo", done: photoDone },
  ];

  return { percentage: Math.round((score / TOTAL_POINTS) * 100), badges };
}

/** Read the inputs for one user. Accepts a transaction so recompute can join a caller's transaction. */
export async function loadCompletionInputs(userId: number, trx?: Knex | Knex.Transaction): Promise<CompletionInputs | null> {
  const db = trx ?? masterKnex;

  const user = await db("platform_users")
    .select("first_name", "last_name", "photo_url")
    .where({ id: userId })
    .whereNull("deleted_at")
    .first();
  if (!user) return null;

  const profile = await db("platform_user_profiles")
    .select("nationality_id", "country_of_residence_id", "budget_min", "budget_max", "preferred_destinations")
    .where({ user_id: userId })
    .whereNull("deleted_at")
    .first();

  const [{ count: qualCount }] = await db("platform_user_qualifications")
    .where({ user_id: userId })
    .whereNull("deleted_at")
    .count<{ count: string }[]>("* as count");
  const [{ count: testCount }] = await db("platform_user_language_tests")
    .where({ user_id: userId })
    .whereNull("deleted_at")
    .count<{ count: string }[]>("* as count");

  return {
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
    photo_url: user.photo_url ?? null,
    nationality_id: profile?.nationality_id ?? null,
    country_of_residence_id: profile?.country_of_residence_id ?? null,
    budget_min: profile?.budget_min ?? null,
    budget_max: profile?.budget_max ?? null,
    preferred_destinations: profile?.preferred_destinations ?? null,
    qualification_count: Number(qualCount),
    language_test_count: Number(testCount),
  };
}

/** Compute without writing. */
export async function computeCompletion(userId: number, trx?: Knex | Knex.Transaction): Promise<Completion> {
  const inputs = await loadCompletionInputs(userId, trx);
  if (!inputs) return { percentage: 0, badges: scoreCompletion(emptyInputs()).badges };
  return scoreCompletion(inputs);
}

/**
 * Compute and persist into the pre-existing platform_user_profiles.completion_percentage.
 * Called after every write that affects the score — NOT after work-experience writes, which contribute
 * nothing to it. Returns the completion so callers can echo it without a second read.
 */
export async function recomputeCompletion(userId: number, trx?: Knex | Knex.Transaction): Promise<Completion> {
  const db = trx ?? masterKnex;
  const completion = await computeCompletion(userId, trx);
  await db("platform_user_profiles")
    .where({ user_id: userId })
    .whereNull("deleted_at")
    .update({ completion_percentage: completion.percentage, updated_at: db.fn.now() });
  return completion;
}

function emptyInputs(): CompletionInputs {
  return {
    first_name: null, last_name: null, photo_url: null,
    nationality_id: null, country_of_residence_id: null,
    budget_min: null, budget_max: null, preferred_destinations: null,
    qualification_count: 0, language_test_count: 0,
  };
}
