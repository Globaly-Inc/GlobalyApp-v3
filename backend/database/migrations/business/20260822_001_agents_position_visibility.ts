import type { Knex } from "knex";

// V1-parity team fields: an optional job title, and whether this member shows up on the
// business's public team list (business.show_team_public still gates the whole section).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (t) => {
    t.text("position").nullable();
    t.boolean("is_public").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (t) => {
    t.dropColumn("position");
    t.dropColumn("is_public");
  });
}
