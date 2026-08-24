import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("feed_posts", (t) => {
    t.integer("comments_count").notNullable().defaultTo(0);
  });

  await knex.schema.createTable("feed_comments", (t) => {
    t.increments("id").primary();
    t.integer("post_id").unsigned().notNullable().references("id").inTable("feed_posts").onDelete("CASCADE");
    t.integer("author_platform_user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("content").notNullable();
    // [{ platform_user_id, first_name, last_name }] — resolved at comment time so a mention still renders
    // correctly even if the mentioned agent later leaves the business.
    t.jsonb("mentions").notNullable().defaultTo("[]");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("deleted_at").nullable();
    t.index(["post_id", "created_at", "id"], "feed_comments_post_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("feed_comments");
  await knex.schema.alterTable("feed_posts", (t) => {
    t.dropColumn("comments_count");
  });
}
