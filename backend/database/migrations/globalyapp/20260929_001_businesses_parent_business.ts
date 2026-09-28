// Business twin of 20260928_001_institutions_parent_institution: a branch created from a
// business's Branches tab is its own business, and the business_branches row linking it lives in
// the PARENT's tenant schema — this master-level pointer lets the org switcher nest it.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("businesses", (t) => {
    t.integer("parent_business_id").nullable().references("id").inTable("businesses").onDelete("SET NULL");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("businesses", (t) => {
    t.dropColumn("parent_business_id");
  });
}
