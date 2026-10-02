import type { Knex } from "knex";

// Reintroduced — a dormant "Add Contact" row and a genuine accepted agent are both allowed to
// carry admin_point_of_contact: true at the same time now (a promoted contact should keep
// showing on the Contacts tab after accepting), so admin_point_of_contact alone can no longer
// tell the Users tab which rows to exclude. is_contact_only is that signal instead: true only
// for a row that has never been through an invite-accept — set by createContact, cleared the
// moment that same row accepts a real invite (see acceptInvitation/insertAgent).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (t) => {
    t.boolean("is_contact_only").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("agents", (t) => {
    t.dropColumn("is_contact_only");
  });
}
