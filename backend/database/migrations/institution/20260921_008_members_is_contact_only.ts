import type { Knex } from "knex";

// Institution twin of business/20260921_009_agents_is_contact_only.ts — see its comment.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("members", (t) => {
    t.boolean("is_contact_only").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("members", (t) => {
    t.dropColumn("is_contact_only");
  });
}
