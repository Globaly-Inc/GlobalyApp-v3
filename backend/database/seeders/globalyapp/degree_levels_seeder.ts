import type { Knex } from "knex";

// THE list of degree levels — edit it here and nowhere else. Extraction reads the seeded rows from
// the database at runtime (data-extraction/lib/lookup-catalog.ts) and the extraction prompt is
// built from these names, so adding, renaming or retiring a level is this file plus
// `knex seed:run --env globalyapp --specific=degree_levels_seeder.ts`. No code change.
//
// SLUGS never move, even though ids do: they are a de-facto enum across the app (frontend
// scholarship filters, personal-profile onboarding, the search DEGREE_LABEL map,
// data-extraction/lib/agentcis-mappers.ts), and public.platform_user_profiles /
// public.scholarships store them as text. Which is why "PHD" keeps the slug `doctoral`. Rename a
// level freely; re-point a slug and you break those.
//
// Ids are serial and follow the list order — active levels 1–11 in level order, retired ones last.
// Safe to renumber because nothing stores a degree_level id: the `degree_level_id` columns on
// superadmin.extraction_eligibility_requirements and the tenant service_eligibility_requirements
// are unpopulated, and business services' `degree_level` schema-field value (which WOULD be an id)
// has no rows yet. Re-check both before renumbering again.
//
// is_active false = retired: no longer offered as something to link to, but kept so existing data
// stays valid. The platform list folds these into live rows (Associate Degree → Bachelor, Graduate
// Certificate → Graduate Diploma, Other → Non AQF Award); that mapping lives in lookup-catalog.ts.
const DEGREE_LEVELS = [
  { id: 1, slug: "school", name: "School", is_active: true },
  { id: 2, slug: "high_school", name: "High School", is_active: true },
  { id: 3, slug: "certificate", name: "Certificate", is_active: true },
  { id: 4, slug: "diploma", name: "Diploma", is_active: true },
  { id: 5, slug: "advance_diploma", name: "Advance Diploma", is_active: true },
  { id: 6, slug: "non_aqf_award", name: "Non AQF Award", is_active: true },
  { id: 7, slug: "bachelor", name: "Bachelor", is_active: true },
  { id: 8, slug: "graduate_diploma", name: "Graduate Diploma", is_active: true },
  { id: 9, slug: "master", name: "Master", is_active: true },
  { id: 10, slug: "master_research", name: "Master (Research)", is_active: true },
  { id: 11, slug: "doctoral", name: "PHD", is_active: true },
  { id: 12, slug: "associate", name: "Associate Degree", is_active: false },
  { id: 13, slug: "graduate_certificate", name: "Graduate Certificate", is_active: false },
  { id: 14, slug: "other", name: "Other", is_active: false },
];

/**
 * Two phases inside one transaction, same as the areas seeder: `slug` and `name` are both UNIQUE,
 * and this list renames rows in place ("Bachelor's" → "Bachelor", "Doctoral (PhD)" → "PHD").
 * Parking every listed row on a placeholder first frees the values the final write needs, so a
 * later rename or reorder can't collide. Rows not on the list are deactivated, never deleted.
 */
export async function seed(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    for (const level of DEGREE_LEVELS) {
      await trx("degree_levels").where({ id: level.id })
        .update({ slug: `__seeding_${level.id}`, name: `__seeding_${level.id}` });
    }

    for (const [i, level] of DEGREE_LEVELS.entries()) {
      const fields = { slug: level.slug, name: level.name, sort_order: i + 1, is_active: level.is_active };
      const byId = await trx("degree_levels").where({ id: level.id }).first();
      if (byId) {
        await trx("degree_levels").where({ id: level.id }).update({ ...fields, updated_at: trx.fn.now() });
        continue;
      }
      const bySlug = await trx("degree_levels").where({ slug: level.slug }).first();
      if (bySlug) await trx("degree_levels").where({ id: bySlug.id }).update({ ...fields, updated_at: trx.fn.now() });
      else await trx("degree_levels").insert({ id: level.id, ...fields });
    }

    await trx("degree_levels")
      .whereNotIn("slug", DEGREE_LEVELS.map((d) => d.slug))
      .update({ is_active: false, updated_at: trx.fn.now() });
    await trx.raw(
      "SELECT setval(pg_get_serial_sequence('degree_levels', 'id'), (SELECT MAX(id) FROM degree_levels))",
    );
  });
}
