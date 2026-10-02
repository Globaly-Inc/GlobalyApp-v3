import type { Knex } from "knex";

// Contact-CRM fields, ported from the now-dropped business_contacts table onto `agents`
// directly — "Add Contact" creates a real (dormant) agent row instead of a separate table.
// `agents.admin_point_of_contact` already exists (20260803_002) — not repeated here.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (t) => {
    t.text("job_title").nullable();
    t.text("department").nullable();
    t.text("linkedin_url").nullable();
    t.text("other_url").nullable();
    t.specificType("tags", "text[]").notNullable().defaultTo("{}");
    t.text("preferred_channel").nullable();
    t.boolean("is_primary").notNullable().defaultTo(false);
    t.text("notes").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (t) => {
    t.dropColumn("job_title");
    t.dropColumn("department");
    t.dropColumn("linkedin_url");
    t.dropColumn("other_url");
    t.dropColumn("tags");
    t.dropColumn("preferred_channel");
    t.dropColumn("is_primary");
    t.dropColumn("notes");
  });
}
