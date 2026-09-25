import type { Knex } from "knex";

// "Create branch" now mints a real, separately-loggable institution (see business-branches.service.ts's
// createInstitutionBranch) rather than a plain address record — linked_institution_id records which
// institutions.id it is, mirroring linked_business_id's role for a linked business.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("business_branches", (t) => {
    t.integer("linked_institution_id").unsigned().nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("business_branches", (t) => {
    t.dropColumn("linked_institution_id");
  });
}
