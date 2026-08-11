import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("issuing_organizations", (t) => {
    t.increments("id").primary();
    t.text("name").notNullable().unique();
    t.text("logo_url").nullable();
    t.text("website").nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("issuing_organizations");
}
