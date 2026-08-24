import type { Knex } from "knex";

// Businesses created via the admin "Add Business" form never got `business_type` set (it only
// asked for a business_category_id) — see businesses.service.ts's createBusiness fix. Public
// search filters on business_type, so any such business was invisible there. Backfill existing
// rows from their category's slug (not id — ids aren't guaranteed to match the seeder's intent
// in every environment).
const BUSINESS_TYPE_BY_CATEGORY_SLUG: Record<string, string> = {
  institutions: "institution",
  education_agency: "agent",
  visa_services: "service_provider",
  accreditation_body: "accreditation_body",
  migration_agents: "agent",
  immigration_departments: "immigration_department",
};

export async function up(knex: Knex): Promise<void> {
  for (const [slug, businessType] of Object.entries(BUSINESS_TYPE_BY_CATEGORY_SLUG)) {
    await knex("businesses")
      .whereIn("business_category_id", knex("business_categories").select("id").where({ slug }))
      .whereNull("business_type")
      .update({ business_type: businessType });
  }
}

export async function down(): Promise<void> {
  // Not reversible — we don't know which rows had a real null vs a backfilled value.
}
