import type { Knex } from "knex";

const AREAS_OF_STUDY = [
  { id: 1, slug: "business_management", name: "Business & Management", sort_order: 1 },
  { id: 2, slug: "information_technology", name: "Information Technology", sort_order: 2 },
  { id: 3, slug: "engineering", name: "Engineering", sort_order: 3 },
  { id: 4, slug: "health_community", name: "Health & Community", sort_order: 4 },
  { id: 5, slug: "arts_design", name: "Arts & Design", sort_order: 5 },
  { id: 6, slug: "science", name: "Science", sort_order: 6 },
  { id: 7, slug: "education", name: "Education", sort_order: 7 },
  { id: 8, slug: "law", name: "Law", sort_order: 8 },
  { id: 9, slug: "hospitality_tourism", name: "Hospitality & Tourism", sort_order: 9 },
  { id: 10, slug: "agriculture", name: "Agriculture", sort_order: 10 },
];

export async function seed(knex: Knex): Promise<void> {
  await knex("areas_of_study")
    .insert(AREAS_OF_STUDY.map((a) => ({ ...a, is_active: true })))
    .onConflict("id")
    .merge();
  await knex.raw(
    "SELECT setval(pg_get_serial_sequence('areas_of_study', 'id'), (SELECT MAX(id) FROM areas_of_study))",
  );
}
