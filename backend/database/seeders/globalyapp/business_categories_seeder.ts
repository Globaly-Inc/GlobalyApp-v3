import type { Knex } from "knex";

// IDs are pinned — the /search module (backend/src/modules/search/routes/businesses.routes.ts)
// and various admin flows key off these specific category ids (e.g. id 2 = education agency).
const CATEGORIES = [
  { id: 1, slug: "institutions", name: "Institutions", description: "Universities, colleges, and educational institutions", icon: "Building2", sort_order: 0 },
  { id: 2, slug: "education_agency", name: "Education Agency", description: "Education Consultants and Migration Agents", icon: "Users", sort_order: 1 },
  { id: 3, slug: "visa_services", name: "Visa Services", description: "Visa application and immigration support services", icon: "FileCheck", sort_order: 2 },
  { id: 4, slug: "accreditation_body", name: "Accreditation Body", description: "Accreditation and quality assurance organizations", icon: "Shield", sort_order: 3 },
  { id: 5, slug: "migration_agents", name: "Migration Agents", description: null, icon: "Scale", sort_order: 50 },
  { id: 6, slug: "immigration_departments", name: "Immigration Departments", description: null, icon: "shield-check", sort_order: 90 },
];

export async function seed(knex: Knex): Promise<void> {
  for (const c of CATEGORIES) {
    const exists = await knex("business_categories").where({ slug: c.slug }).first();
    if (!exists) await knex("business_categories").insert(c);
  }
  // Explicit ids bypass the id sequence — sync it so the next auto-generated
  // insert (e.g. an admin creating a new category) doesn't collide with these.
  await knex.raw(
    "SELECT setval(pg_get_serial_sequence('business_categories', 'id'), (SELECT MAX(id) FROM business_categories))",
  );
}
