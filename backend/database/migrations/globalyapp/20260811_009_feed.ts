import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("feed_posts", (t) => {
    t.increments("id").primary();
    t.integer("author_platform_user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    // Nullable on purpose — a personal post has no business. V2 required this and made personal posting impossible.
    t.integer("business_id").unsigned().nullable().references("id").inTable("businesses").onDelete("CASCADE");
    t.text("post_type").notNullable().defaultTo("social"); // social | promotion | update | announcement
    t.text("visibility").notNullable().defaultTo("everyone"); // everyone | business | private
    t.text("content").notNullable();
    t.boolean("is_pinned").notNullable().defaultTo(false);
    t.integer("reactions_count").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.index(["deleted_at", "is_pinned", "created_at", "id"], "feed_posts_timeline_idx");
    t.index(["business_id"], "feed_posts_business_idx");
  });

  // Composite PK — the natural key. Exactly one reaction per user per post, addressed by (post, caller),
  // never by an id of its own. A surrogate id would be an unused column needing this same unique index.
  await knex.schema.createTable("feed_reactions", (t) => {
    t.integer("post_id").unsigned().notNullable().references("id").inTable("feed_posts").onDelete("CASCADE");
    t.integer("platform_user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("emoji").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.primary(["post_id", "platform_user_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("feed_reactions");
  await knex.schema.dropTableIfExists("feed_posts");
}
