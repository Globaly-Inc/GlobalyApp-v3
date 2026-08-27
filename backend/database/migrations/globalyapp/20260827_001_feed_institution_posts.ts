import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("feed_posts", (t) => {
    t.integer("institution_id").unsigned().nullable().references("id").inTable("institutions").onDelete("CASCADE");
    t.index(["institution_id"], "feed_posts_institution_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("feed_posts", (t) => {
    t.dropIndex(["institution_id"], "feed_posts_institution_idx");
    t.dropColumn("institution_id");
  });
}
