import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";
  await knex.schema.withSchema(s).createTable("guides", (t) => {
    t.increments("id").primary();
    t.text("title").notNullable();
    t.text("slug").notNullable().unique();
    t.text("country").nullable();
    t.text("context").nullable();
    t.text("background_image_url").nullable();
    t.text("background_video_url").nullable();
    t.text("pdf_url").nullable();
    t.text("pdf_cover_image_url").nullable();
    t.boolean("is_published").notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
  await knex.schema.withSchema(s).createTable("guide_leads", (t) => {
    t.increments("id").primary();
    t.integer("guide_id").notNullable().references("id").inTable("superadmin.guides");
    t.text("name").notNullable();
    t.text("email").notNullable();
    t.timestamp("email_sent_at").nullable();
    t.timestamps(true, true);
    t.unique(["guide_id", "email"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  const s = "superadmin";
  await knex.schema.withSchema(s).dropTableIfExists("guide_leads");
  await knex.schema.withSchema(s).dropTableIfExists("guides");
}
