import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";

  await knex.schema.withSchema(s).createTable("blog_posts", (t) => {
    t.increments("id").primary();
    t.text("title").notNullable();
    t.text("slug").notNullable().unique();
    t.text("excerpt").nullable();
    t.text("content").nullable();
    t.text("category").nullable(); // topic: Study/Work/Live
    t.text("country_focus").nullable();
    t.jsonb("tags").nullable();
    t.integer("creator_id").nullable().references("id").inTable("superadmin.admin_users");
    t.text("author_name").nullable();
    t.text("author_avatar_url").nullable();
    t.text("cover_image_url").nullable();
    t.boolean("is_published").notNullable().defaultTo(false);
    t.timestamp("published_at").nullable();
    t.integer("views").notNullable().defaultTo(0);
    t.integer("reading_time_minutes").notNullable().defaultTo(5);
    t.text("meta_title").nullable();
    t.text("meta_description").nullable();
    t.text("focus_keyword").nullable();
    t.integer("seo_score").nullable();
    t.text("canonical_url").nullable();
    t.text("og_image_url").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  await knex.schema.withSchema(s).createTable("blog_keywords", (t) => {
    t.increments("id").primary();
    t.text("keyword").notNullable().unique();
    t.text("category").nullable();
    t.text("difficulty").nullable(); // easy|medium|hard
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  const s = "superadmin";
  await knex.schema.withSchema(s).dropTableIfExists("blog_keywords");
  await knex.schema.withSchema(s).dropTableIfExists("blog_posts");
}
