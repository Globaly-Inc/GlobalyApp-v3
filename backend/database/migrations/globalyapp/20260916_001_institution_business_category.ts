import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("institutions", (t) => {
    t.integer("business_category_id").unsigned().nullable().references("id").inTable("business_categories");
  });
  // Backfill existing institutions onto the "Institutions" category so the field starts populated.
  const category = await knex("business_categories").where({ slug: "institutions" }).first("id");
  if (category) await knex("institutions").update({ business_category_id: category.id });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("institutions", (t) => {
    t.dropColumn("business_category_id");
  });
}
