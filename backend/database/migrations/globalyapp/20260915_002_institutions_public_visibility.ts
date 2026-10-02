import type { Knex } from "knex";

/**
 * Per-section public/private control for institution profiles — the twin of the column
 * `businesses` got in 20260822_004 and `platform_user_profiles` in 20260824_001. Institutions
 * render through the same profile page, so without this their Public/Private pills had nowhere
 * to write and had to be disabled.
 *
 * Defaults to `{}` rather than a populated map: the read rule is "public unless the key says
 * false", so an empty object means an existing institution keeps publishing exactly as it does now.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("institutions", (t) => {
    t.jsonb("public_visibility").notNullable().defaultTo("{}");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("institutions", (t) => {
    t.dropColumn("public_visibility");
  });
}
