import type { Knex } from "knex";

// Self-service (business/institution) creation went straight into the shared global catalog with
// no review, unlike the adjacent accreditation proposal flow — another org could immediately
// select and rely on an unvetted issuing organization. Mirrors accreditations' own review columns:
// existing (admin-created) rows default to "approved" so nothing already in the catalog regresses.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("issuing_organizations", (t) => {
    t.text("status").notNullable().defaultTo("approved");
    t.integer("reviewed_by").nullable();
    t.timestamp("reviewed_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("issuing_organizations", (t) => {
    t.dropColumn("status");
    t.dropColumn("reviewed_by");
    t.dropColumn("reviewed_at");
  });
}
