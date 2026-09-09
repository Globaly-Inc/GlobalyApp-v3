import type { Knex } from "knex";

// THE list of subject areas — edit it here and nowhere else. Extraction reads the seeded rows from
// the database at runtime (data-extraction/lib/lookup-catalog.ts) and the extraction prompt's enum
// is built from these names, so adding, renaming, reordering or retiring an area is this file plus
// `knex seed:run --env globalyapp --specific=areas_of_study_seeder.ts`. No code change.
//
// Ids are serial and follow the list order. Safe to renumber because nothing stores an area id:
// staged courses link by SLUG (extraction_courses.subject_area_code), and business services keep
// their `area_of_study` schema-field value as an id but none exist yet — check before renumbering
// again (see business-services.service.ts withListExtras).
const AREAS_OF_STUDY = [
  { id: 1, slug: "agriculture_veterinary_medicine", name: "Agriculture and Veterinary Medicine" },
  { id: 2, slug: "applied_pure_science", name: "Applied and Pure Science" },
  { id: 3, slug: "architecture_construction", name: "Architecture and Construction" },
  { id: 4, slug: "business_management", name: "Business and Management" },
  { id: 5, slug: "computer_science_it", name: "Computer Science and IT" },
  { id: 6, slug: "creative_arts_design", name: "Creative Arts and Design" },
  { id: 7, slug: "education_training", name: "Education and Training" },
  { id: 8, slug: "engineering", name: "Engineering" },
  { id: 9, slug: "health_medicine", name: "Health and Medicine" },
  { id: 10, slug: "humanities", name: "Humanities" },
  { id: 11, slug: "law", name: "Law" },
  { id: 12, slug: "personal_care_fitness", name: "Personal Care and Fitness" },
  { id: 13, slug: "social_studies_media", name: "Social Studies and Media" },
  { id: 14, slug: "travel_hospitality", name: "Travel and Hospitality" },
];

/**
 * Converges the table onto the list rather than only inserting what's missing, because the list
 * renames rows in place — and does it in two phases inside one transaction.
 *
 * The two phases matter: `slug` and `name` are both UNIQUE, and a rename shuffles values between
 * rows (id 4 takes the `business_management` that id 1 used to hold). Parking every listed row on
 * a placeholder first means the final write can never collide, whatever order the list is in —
 * so this stays correct if you reorder or rename entries later.
 *
 * Rows not on the list are deactivated, never deleted: an id someone else points at stays valid,
 * and link pickers only offer active rows.
 */
export async function seed(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // Phase 1 — park the rows this seed will rewrite, freeing every slug and name it needs.
    for (const area of AREAS_OF_STUDY) {
      await trx("areas_of_study").where({ id: area.id })
        .update({ slug: `__seeding_${area.id}`, name: `__seeding_${area.id}` });
    }

    // Phase 2 — write the list.
    for (const [i, area] of AREAS_OF_STUDY.entries()) {
      const fields = { slug: area.slug, name: area.name, sort_order: i + 1, is_active: true };
      const byId = await trx("areas_of_study").where({ id: area.id }).first();
      if (byId) {
        await trx("areas_of_study").where({ id: area.id }).update({ ...fields, updated_at: trx.fn.now() });
        continue;
      }
      // No row at that id — an unlisted row may already hold the slug (added through the admin UI).
      const bySlug = await trx("areas_of_study").where({ slug: area.slug }).first();
      if (bySlug) await trx("areas_of_study").where({ id: bySlug.id }).update({ ...fields, updated_at: trx.fn.now() });
      else await trx("areas_of_study").insert({ id: area.id, ...fields });
    }

    await trx("areas_of_study")
      .whereNotIn("slug", AREAS_OF_STUDY.map((a) => a.slug))
      .update({ is_active: false, updated_at: trx.fn.now() });
    await trx.raw(
      "SELECT setval(pg_get_serial_sequence('areas_of_study', 'id'), (SELECT MAX(id) FROM areas_of_study))",
    );
  });
}
