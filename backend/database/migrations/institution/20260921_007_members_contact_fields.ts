import type { Knex } from "knex";

// Institution twin of business/20260921_007_agents_contact_fields.ts. Unlike `agents`,
// `members` doesn't have `admin_point_of_contact` yet (20260810_001) — added here too.
//
// hasColumn-guarded: an earlier, since-reverted-on-disk attempt at this same column already ran
// its DDL against some tenants before its ledger row was cleared (clearing the ledger undoes
// Knex's bookkeeping, not the ALTER TABLE it already executed) — so `admin_point_of_contact` may
// already exist there. Every column is checked independently since which ones landed varies.
export async function up(knex: Knex): Promise<void> {
  const columns = {
    admin_point_of_contact: (t: Knex.AlterTableBuilder) => t.boolean("admin_point_of_contact").notNullable().defaultTo(false),
    job_title: (t: Knex.AlterTableBuilder) => t.text("job_title").nullable(),
    department: (t: Knex.AlterTableBuilder) => t.text("department").nullable(),
    linkedin_url: (t: Knex.AlterTableBuilder) => t.text("linkedin_url").nullable(),
    other_url: (t: Knex.AlterTableBuilder) => t.text("other_url").nullable(),
    tags: (t: Knex.AlterTableBuilder) => t.specificType("tags", "text[]").notNullable().defaultTo("{}"),
    preferred_channel: (t: Knex.AlterTableBuilder) => t.text("preferred_channel").nullable(),
    is_primary: (t: Knex.AlterTableBuilder) => t.boolean("is_primary").notNullable().defaultTo(false),
    notes: (t: Knex.AlterTableBuilder) => t.text("notes").nullable(),
  };
  for (const [column, addColumn] of Object.entries(columns)) {
    if (await knex.schema.hasColumn("members", column)) continue;
    await knex.schema.alterTable("members", addColumn);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("members", (t) => {
    t.dropColumn("admin_point_of_contact");
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
