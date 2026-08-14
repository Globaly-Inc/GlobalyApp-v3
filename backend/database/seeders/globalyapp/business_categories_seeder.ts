import type { Knex } from "knex";

const CATEGORIES = [
  { slug: "institutions", name: "Institutions", description: "Universities, colleges, and educational institutions", icon: "Building2", sort_order: 0 },
  { slug: "education_agency", name: "Education Agency", description: "Education Consultants and Migration Agents", icon: "Users", sort_order: 1 },
  { slug: "service_provider", name: "Service Provider", description: "Accommodation, insurance, banking, and other services", icon: "Briefcase", sort_order: 2 },
  { slug: "accreditation_body", name: "Accreditation Body", description: "Accreditation and quality assurance organizations", icon: "Shield", sort_order: 3 },
  { slug: "migration_agents", name: "Migration Agents", description: null, icon: "Scale", sort_order: 50 },
  { slug: "immigration_departments", name: "Immigration Departments", description: null, icon: "shield-check", sort_order: 90 },
];

export async function seed(knex: Knex): Promise<void> {
  for (const c of CATEGORIES) {
    const exists = await knex("business_categories").where({ slug: c.slug }).first();
    if (!exists) await knex("business_categories").insert(c);
  }
}
