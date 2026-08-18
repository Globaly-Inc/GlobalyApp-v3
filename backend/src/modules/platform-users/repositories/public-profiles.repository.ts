// Public student profile repository.
//
// THE WHOLE POINT OF THIS FILE IS THE COLUMN LIST.
//
// `platform_user_profiles` carries a student's street address, postcode, coordinates, date of
// birth, budget currency and completion metrics; `platform_users` carries their email and
// phone. None of it may reach an anonymous reader. So this repository never does `select *`
// and never hands a whole row to the service — it enumerates, by name, only the columns V1's
// StudentPublicProfilePage actually rendered to a public visitor. A column added to the table
// tomorrow is therefore private by default: it has to be added here on purpose to leak.

import { masterKnex } from "../../../core/db/master-pool.js";

/** Exactly the profile columns V1's public page rendered. Nothing else is ever selected. */
export interface PublicProfileRow {
  user_id: number;
  slug: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  institution_attended: string | null;
  highest_degree_level: string | null;
  nationality: string | null;
  country_of_residence: string | null;
  fields_of_study: { name?: string }[] | null;
  preferred_destinations: number[] | null;
  linkedin_url: string | null;
  website_url: string | null;
  budget_min: number | null;
  budget_max: number | null;
  public_visibility: unknown;
}

export async function findPublishedProfileBySlug(slug: string): Promise<PublicProfileRow | undefined> {
  return masterKnex("platform_user_profiles as p")
    .join("platform_users as u", "u.id", "p.user_id")
    .leftJoin("countries as nat", "nat.id", "p.nationality_id")
    .leftJoin("countries as res", "res.id", "p.country_of_residence_id")
    .where("p.profile_slug", slug)
    .whereNull("p.deleted_at")
    .whereNull("u.deleted_at")
    .select(
      "p.user_id",
      "p.profile_slug as slug",
      "u.first_name",
      "u.last_name",
      "u.photo_url",
      "p.institution_attended",
      "p.highest_degree_level",
      // Country NAMES, never the ids — an id is a join key into a table this reader cannot see.
      "nat.name as nationality",
      "res.name as country_of_residence",
      "p.fields_of_study",
      "p.preferred_destinations",
      "p.linkedin_url",
      "p.website_url",
      "p.budget_min",
      "p.budget_max",
      "p.public_visibility",
    )
    .first() as Promise<PublicProfileRow | undefined>;
}

/** Country names for the student's preferred destinations, in the order they were chosen. */
export async function countryNames(ids: number[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await masterKnex("countries").whereIn("id", ids).select("id", "name");
  const byId = new Map(rows.map((r) => [Number(r.id), String(r.name)]));
  return ids.map((id) => byId.get(Number(id))).filter((name): name is string => !!name);
}

const QUALIFICATION_COLUMNS = [
  "id",
  "qualification_type",
  "degree_title",
  "subject_area",
  "institution_name",
  "grading_system",
  "grade_value",
  "is_current",
  "start_date",
  "end_date",
] as const;

const WORK_COLUMNS = ["id", "job_title", "organization_name", "is_current", "start_date", "end_date"] as const;

const TEST_COLUMNS = ["id", "test_status", "test_type", "overall_score", "test_date", "sub_scores"] as const;

export async function listPublicQualifications(userId: number) {
  return masterKnex("platform_user_qualifications")
    .where({ user_id: userId })
    .whereNull("deleted_at")
    .orderBy("sort_order")
    .select(QUALIFICATION_COLUMNS);
}

export async function listPublicWorkExperiences(userId: number) {
  return masterKnex("platform_user_work_experiences")
    .where({ user_id: userId })
    .whereNull("deleted_at")
    .orderBy("sort_order")
    .select(WORK_COLUMNS);
}

/** `category` is the discriminator from 20260816_002 — "language" (IELTS…) or "academic" (GRE…). */
export async function listPublicTests(userId: number, category: "language" | "academic") {
  return masterKnex("platform_user_language_tests")
    .where({ user_id: userId, category })
    .whereNull("deleted_at")
    .orderBy("sort_order")
    .select(TEST_COLUMNS);
}

/** Current publish state, for the owner's own view. */
export async function findPublishState(userId: number) {
  return masterKnex("platform_user_profiles")
    .where({ user_id: userId })
    .whereNull("deleted_at")
    .first("profile_slug", "public_visibility");
}

/**
 * Derive the slug with the same function C2b's org slugs use (20260817_004_org_slugs.ts):
 * slugify(name) + "-u" + the user's own id. Unique by construction across every student
 * because ids are unique and never change — no retry loop, no uniqueness probe, no race.
 * The unique index on profile_slug guards a hand-set duplicate, not the mechanism.
 */
export async function deriveSlug(userId: number, firstName: string, lastName: string): Promise<string> {
  const name = [firstName, lastName].filter(Boolean).join(" ");
  const result = await masterKnex.raw("select public.org_public_slug(?, 'u', ?) as slug", [name, userId]);
  return result.rows[0].slug as string;
}

export async function setPublishState(
  userId: number,
  data: { profile_slug?: string | null; public_visibility?: unknown },
) {
  await masterKnex("platform_user_profiles")
    .where({ user_id: userId })
    .whereNull("deleted_at")
    .update({ ...data, updated_at: masterKnex.fn.now() });
}
