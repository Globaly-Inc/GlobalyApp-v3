import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("onboarding_invitations", (t) => {
    t.text("contact_name").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("onboarding_invitations", (t) => {
    t.dropColumn("contact_name");
  });
}
