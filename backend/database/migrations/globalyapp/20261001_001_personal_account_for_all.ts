import type { Knex } from "knex";

// Every platform user has a personal account — including invited org members and org owners who
// were created without one — so the Personal Portal and their personal profile always open.
// New rows get it from the column default (and platform-users.repository's insert); this
// backfills everyone else. down() only restores the default: which rows were false before is
// not recorded, and turning personal access back off would lock people out of their profile.
export async function up(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE platform_users ALTER COLUMN is_personal_account SET DEFAULT true");
  await knex("platform_users").where({ is_personal_account: false }).update({ is_personal_account: true });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE platform_users ALTER COLUMN is_personal_account SET DEFAULT false");
}
