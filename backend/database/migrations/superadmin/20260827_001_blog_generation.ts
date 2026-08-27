import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";
  await knex.schema.withSchema(s).createTable("blog_generation_jobs", (t) => {
    t.increments("id").primary();
    t.text("status").notNullable().defaultTo("pending"); // pending|running|done|failed
    t.jsonb("keywords").notNullable();
    t.text("context").nullable();
    t.text("topic").nullable();
    t.text("country").nullable();
    t.integer("blog_post_id").nullable().references("id").inTable("superadmin.blog_posts");
    t.text("error").nullable();
    t.timestamps(true, true);
  });
  await knex.schema.withSchema(s).alterTable("blog_posts", (t) => {
    t.boolean("generated_by_ai").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  const s = "superadmin";
  await knex.schema.withSchema(s).alterTable("blog_posts", (t) => t.dropColumn("generated_by_ai"));
  await knex.schema.withSchema(s).dropTableIfExists("blog_generation_jobs");
}
