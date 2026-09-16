import type { Knex } from "knex";

// Institution twin of database/migrations/business/20260916_003_business_contacts.ts — same
// table name deliberately, so the existing business-contacts repository is reusable unmodified.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_contacts", (t) => {
    t.increments("id").primary();
    t.uuid("uuid").notNullable().unique().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("full_name").notNullable();
    t.text("job_title").nullable();
    t.text("department").nullable();
    t.text("email").nullable();
    t.text("phone").nullable();
    t.text("phone_country_code").nullable();
    t.text("linkedin_url").nullable();
    t.text("other_url").nullable();
    t.specificType("tags", "text[]").notNullable().defaultTo("{}");
    t.text("preferred_channel").nullable();
    t.boolean("is_primary").notNullable().defaultTo(false);
    t.text("notes").nullable();
    t.integer("created_by").unsigned().nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_contacts");
}
