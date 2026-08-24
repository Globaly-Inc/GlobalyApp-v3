import type { Knex } from "knex";

// Same values as the `degree_level`/`degree_levels` enums used across courses and scholarships
// (frontend DEGREE_LABEL map) — keep this list in sync with those if either changes.
const DEGREE_LEVELS = [
  { id: 1, slug: "certificate", name: "Certificate", sort_order: 1 },
  { id: 2, slug: "diploma", name: "Diploma", sort_order: 2 },
  { id: 3, slug: "associate", name: "Associate Degree", sort_order: 3 },
  { id: 4, slug: "bachelor", name: "Bachelor's", sort_order: 4 },
  { id: 5, slug: "graduate_certificate", name: "Graduate Certificate", sort_order: 5 },
  { id: 6, slug: "graduate_diploma", name: "Graduate Diploma", sort_order: 6 },
  { id: 7, slug: "master", name: "Master's", sort_order: 7 },
  { id: 8, slug: "doctoral", name: "Doctoral (PhD)", sort_order: 8 },
  { id: 9, slug: "other", name: "Other", sort_order: 9 },
];

export async function seed(knex: Knex): Promise<void> {
  await knex("degree_levels")
    .insert(DEGREE_LEVELS.map((d) => ({ ...d, is_active: true })))
    .onConflict("id")
    .merge();
  await knex.raw(
    "SELECT setval(pg_get_serial_sequence('degree_levels', 'id'), (SELECT MAX(id) FROM degree_levels))",
  );
}
