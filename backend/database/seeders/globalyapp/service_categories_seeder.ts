import type { Knex } from "knex";

const CATEGORIES = [
  { id: 1, slug: "courses", name: "Academic Courses", description: "Degree programs, diplomas, and certificates", icon: "GraduationCap", sort_order: 1 },
  { id: 2, slug: "short_courses", name: "Short Courses", description: "Professional development and language courses", icon: "BookOpen", sort_order: 2 },
  { id: 3, slug: "accommodation", name: "Accommodation", description: "Student housing, homestay, and shared rooms", icon: "Bed", sort_order: 3 },
  { id: 4, slug: "insurance", name: "Insurance", description: "Health, travel, and OSHC insurance", icon: "Shield", sort_order: 4 },
  { id: 5, slug: "banking", name: "Banking & Finance", description: "Student bank accounts and financial services", icon: "Landmark", sort_order: 5 },
  { id: 6, slug: "visa_services", name: "Visa Services", description: "Visa application and migration assistance", icon: "FileCheck", sort_order: 6 },
  { id: 7, slug: "test_preparation", name: "Test Preparation", description: "IELTS, TOEFL, PTE prep courses", icon: "Target", sort_order: 7 },
  { id: 8, slug: "career_services", name: "Career Services", description: "Resume writing, job placement, and internships", icon: "Briefcase", sort_order: 8 },
  { id: 9, slug: "translation", name: "Translation Services", description: "Document translation and NAATI services", icon: "Languages", sort_order: 9 },
  { id: 10, slug: "transport", name: "Transport", description: "Airport pickup and local transport", icon: "Car", sort_order: 10 },
  { id: 11, slug: "visas", name: "Visas", description: null, icon: "stamp", sort_order: 95 },
];

export async function seed(knex: Knex): Promise<void> {
  // Upsert by id, not by slug: id is this table's stable identity (other schemas' FKs point at
  // it), while the slug/name/etc a given id maps to has changed as this taxonomy evolved. A
  // slug-keyed existence check would miss a row whose slug changed and then re-insert its id,
  // hitting the primary key. Keying on id instead makes this safe to re-run in any environment
  // regardless of which past version of this list it was last seeded with.
  for (const c of CATEGORIES) {
    await knex("service_categories").insert({ ...c, is_active: true }).onConflict("id").merge();
  }
  // Explicit ids bypass the id sequence — sync it so the next auto-generated
  // insert (e.g. an admin creating a new category) doesn't collide with these.
  await knex.raw(
    "SELECT setval(pg_get_serial_sequence('service_categories', 'id'), (SELECT MAX(id) FROM service_categories))",
  );
}
