import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("feed_posts", (t) => {
    // Same shape as feed_comments.mentions: [{ platform_user_id, first_name, last_name }], resolved at post
    // time so a mention still renders correctly even if that person later leaves the business.
    t.jsonb("mentions").notNullable().defaultTo("[]");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("feed_posts", (t) => {
    t.dropColumn("mentions");
  });
}
