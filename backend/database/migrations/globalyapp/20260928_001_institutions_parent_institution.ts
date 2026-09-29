// A branch created from an institution's Branches tab is its own institution (see
// createInstitutionBranch). The parent's business_branches row that links it lives in the
// PARENT's tenant schema, which the branch can't find on its own — this master-level pointer is
// how a branch reaches its parent to read the courses shared with it (shared_services).

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("institutions", (t) => {
    t.integer("parent_institution_id").nullable().references("id").inTable("institutions").onDelete("SET NULL");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("institutions", (t) => {
    t.dropColumn("parent_institution_id");
  });
}
