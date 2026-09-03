import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("feed_comments", (t) => {
    t.integer("reactions_count").notNullable().defaultTo(0);
  });

  // Same shape as feed_reactions — composite PK, exactly one reaction per user per comment.
  await knex.schema.createTable("feed_comment_reactions", (t) => {
    t.integer("comment_id").unsigned().notNullable().references("id").inTable("feed_comments").onDelete("CASCADE");
    t.integer("platform_user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("emoji").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.primary(["comment_id", "platform_user_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("feed_comment_reactions");
  await knex.schema.alterTable("feed_comments", (t) => {
    t.dropColumn("reactions_count");
  });
}
