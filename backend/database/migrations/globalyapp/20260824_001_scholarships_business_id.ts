import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("scholarships", (t) => {
    t.integer("business_id").nullable().references("businesses.id").onDelete("CASCADE");
    t.index(["business_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("scholarships", (t) => {
    t.dropColumn("business_id");
  });
}
