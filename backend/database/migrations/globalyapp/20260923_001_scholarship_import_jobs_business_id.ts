import type { Knex } from "knex";

// Business self-service bulk import reuses the admin's job-tracking table — a nullable
// business_id scopes a job to its owner so one business can't poll another's import status
// (findJobForBusiness). Null means an admin-initiated import.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("scholarship_import_jobs", (t) => {
    t.integer("business_id").unsigned().nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasData = await knex("scholarship_import_jobs").whereNotNull("business_id").first();
  if (hasData) throw new Error("Refusing to drop scholarship_import_jobs.business_id: business-owned import jobs exist.");
  await knex.schema.alterTable("scholarship_import_jobs", (t) => {
    t.dropColumn("business_id");
  });
}
