// institutions.account_status — the institution twin of businesses.account_status.
//
// Institutions were self-service only until promote could create one nobody owns, so their
// only "is this real yet" signal was schema_provisioned_at. Businesses have carried an
// explicit account_status (0 = not activated, 1 = activated) since 20260804_001, and the
// claim flow flips it. Adding it here so both tables activate the same way: promote leaves 0,
// accepting the claim sets 1.
//
// schema_provisioned_at stays as it is and keeps its own meaning — "a schema exists". The two
// are set together on claim but answer different questions, and migrate:tenants reads
// schema_provisioned_at specifically.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("institutions", (t) => {
    // Same type and default as businesses.account_status, so the two read identically.
    t.integer("account_status").notNullable().defaultTo(0);
  });

  // Every institution that already has a schema is a real, self-service one whose owner
  // completed onboarding — they must stay enterable. Without this backfill the new default of
  // 0 would lock every existing institution out the moment the gates start reading it.
  // Promoted-but-unclaimed listings have a NULL schema_provisioned_at and correctly stay 0.
  await knex("institutions")
    .whereNotNull("schema_provisioned_at")
    .whereNull("deleted_at")
    .update({ account_status: 1 });

  // Mirrors businesses' index on the same column — every org-context request filters on it.
  await knex.raw(`CREATE INDEX institutions_account_status_idx ON institutions (account_status)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS institutions_account_status_idx`);
  await knex.schema.alterTable("institutions", (t) => {
    t.dropColumn("account_status");
  });
}
