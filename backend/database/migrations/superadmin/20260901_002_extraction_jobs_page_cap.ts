import type { Knex } from "knex";

const S = "superadmin";

// Cost guardrail: discovery on a large university site can queue thousands of pages,
// each one a scrape + a Gemini extraction. Cap what a job may queue — 500 covers a full
// course catalogue on most sites, and the institution's contact info (email/phone/logo)
// comes from the homepage overview phase, which doesn't consume queue slots. The admin
// "Deep scrape" action raises the cap by 500 per press for sites that genuinely need more.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("extraction_jobs", (t) => {
    t.integer("page_cap").notNullable().defaultTo(500);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable("extraction_jobs", (t) => {
    t.dropColumn("page_cap");
  });
}
