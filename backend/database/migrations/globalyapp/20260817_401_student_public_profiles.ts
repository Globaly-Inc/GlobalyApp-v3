// Wave D4 — public student profiles.
//
// Two columns on platform_user_profiles, mirroring V1's `profiles.profile_slug` /
// `profiles.public_visibility` (both present in v1_staging.profiles) which V2's
// students-public.ts reads.
//
// WHY THE SLUG IS THE PUBLISH FLAG
// V1 has no `is_public` column. Setting a slug IS the publish action, and clearing
// it unpublishes. Keeping that here means one piece of state instead of two that
// can disagree (published=true with no slug ⇒ an unreachable public profile;
// published=false with a slug ⇒ a live URL nobody thinks is live), and it makes
// the public read a single indexed lookup with no second predicate to forget.
//
// WHY NO BEFORE-INSERT TRIGGER, UNLIKE 20260817_004_org_slugs.ts
// That migration auto-fills every org's slug on insert because an org is public by
// default — it exists to be found. A student is not. A trigger that filled
// profile_slug on insert would publish every student's profile the moment they
// onboard, which is the exact privacy failure this wave exists to avoid. So: same
// derivation function (public.org_public_slug, reused verbatim with the 'u'
// prefix), same collision-free-by-construction guarantee, but called from the
// publish service rather than a trigger. NULL means "not published" and stays NULL
// until the student asks.
//
// Deterministic derivation still buys the same things it bought C2b: no retry
// loop, no uniqueness probe, no race. The unique index below guards a hand-set
// duplicate (and a W5 import carrying a V1 slug across verbatim), not the
// mechanism.
//
// public_visibility is nullable jsonb: NULL means "the defaults", which the
// service owns (about/education/work_experience/language_tests/academic_tests/
// social_links true, contact_info false — V1's DEFAULT_VISIBILITY). Storing the
// defaults would freeze them at publish time; resolving them at read time means
// changing the default changes every profile that never customised it.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("platform_user_profiles", (t) => {
    t.text("profile_slug").nullable();
    t.jsonb("public_visibility").nullable();
    t.unique(["profile_slug"], { indexName: "platform_user_profiles_slug_unique" });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("platform_user_profiles", (t) => {
    t.dropUnique(["profile_slug"], "platform_user_profiles_slug_unique");
    t.dropColumn("public_visibility");
    t.dropColumn("profile_slug");
  });
}
