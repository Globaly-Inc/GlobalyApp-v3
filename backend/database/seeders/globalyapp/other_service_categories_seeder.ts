import type { Knex } from "knex";

/**
 * The categories a person may sell under through Earn → My Services.
 *
 * These are reference data an admin owns, not sample data: they are the fixed list a seller must choose from
 * (Platform → Categories → Other Service Categories), and a seller cannot add to it.
 */

const CATEGORIES = [
  { slug: "airport_pickup", name: "Airport Pickup", icon: "Plane", sort_order: 1 },
  { slug: "city_orientation", name: "City Orientation", icon: "Map", sort_order: 2 },
  { slug: "rental_support", name: "Rental Support", icon: "Home", sort_order: 3 },
  { slug: "employment_support", name: "Employment Setup & Support", icon: "Briefcase", sort_order: 4 },
  { slug: "assignment_help", name: "Assignment Help", icon: "FileText", sort_order: 5 },
  { slug: "private_tutoring", name: "Private Tutoring", icon: "GraduationCap", sort_order: 6 },
  { slug: "other", name: "Other", icon: "Package", sort_order: 7 },
];

export async function seed(knex: Knex): Promise<void> {
  // Insert-or-ignore rather than delete-then-insert, which is the usual seeder shape: listings reference
  // these rows with a RESTRICT foreign key, so deleting them would fail once anything is listed — and
  // re-running must not reset an admin's edits to a name, icon or sort order.
  await knex("other_service_categories")
    .insert(CATEGORIES.map((c) => ({ ...c, is_active: true })))
    .onConflict("slug")
    .ignore();
}
