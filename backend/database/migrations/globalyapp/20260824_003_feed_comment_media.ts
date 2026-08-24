import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("feed_comments", (t) => {
    // Same shape as feed_posts.media: [{ storage_path, type, mime_type }], view URLs minted per read.
    t.jsonb("media").notNullable().defaultTo("[]");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("feed_comments", (t) => {
    t.dropColumn("media");
  });
}
