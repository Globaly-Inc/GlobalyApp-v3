import type { Knex } from "knex";

// Media is now implemented (upload + render), so the column earns its place.
// Shape: [{ storage_path, type: "image" | "video", mime_type }]
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("feed_posts", (t) => {
    t.jsonb("media").notNullable().defaultTo("[]");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("feed_posts", (t) => {
    t.dropColumn("media");
  });
}
