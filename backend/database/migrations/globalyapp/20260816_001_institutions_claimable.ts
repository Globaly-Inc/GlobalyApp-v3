// M0.3 — unowned directory listings.
// V1 has 39 businesses with no accepted owner carrying 363 of 402 services.
// They need a home in V3 before anybody claims them, so `institutions` becomes
// ownable-later: nullable owner/email/subdomain + an explicit claim_status.
//
// schema_name is added here (not in a later migration) because Wave M6 puts
// services in a per-tenant schema — an unclaimed institution still needs one
// to hold its catalog. Nullable: only provisioned institutions have a schema.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE institutions
      ALTER COLUMN platform_user_id DROP NOT NULL,
      ALTER COLUMN first_name       DROP NOT NULL,
      ALTER COLUMN last_name        DROP NOT NULL,
      ALTER COLUMN email            DROP NOT NULL,
      ALTER COLUMN subdomain        DROP NOT NULL
  `);

  await knex.schema.alterTable("institutions", (t) => {
    t.text("claim_status")
      .notNullable()
      .defaultTo("unclaimed")
      .checkIn(["unclaimed", "pending", "claimed"], "institutions_claim_status_check");
    t.uuid("v1_business_id").nullable().unique(); // idempotency key for the V1 loader
    t.uuid("schema_name").nullable().unique(); // tenant schema holding this institution's catalog
    t.index(["claim_status"], "institutions_claim_status_idx");
    t.index(["country_id"], "institutions_country_id_idx"); // directory filtering
  });

  // Existing rows were all owner-backed by construction.
  await knex("institutions").whereNotNull("platform_user_id").update({ claim_status: "claimed" });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("institutions", (t) => {
    t.dropIndex(["country_id"], "institutions_country_id_idx");
    t.dropIndex(["claim_status"], "institutions_claim_status_idx");
    t.dropColumn("schema_name");
    t.dropColumn("v1_business_id");
    t.dropColumn("claim_status");
  });

  // Fails loudly if unclaimed rows exist — rolling back would silently lose them.
  await knex.raw(`
    ALTER TABLE institutions
      ALTER COLUMN platform_user_id SET NOT NULL,
      ALTER COLUMN first_name       SET NOT NULL,
      ALTER COLUMN last_name        SET NOT NULL,
      ALTER COLUMN email            SET NOT NULL,
      ALTER COLUMN subdomain        SET NOT NULL
  `);
}
