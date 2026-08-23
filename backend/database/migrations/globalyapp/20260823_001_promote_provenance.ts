// Promote provenance — lets an extraction job be published as a live listing.
//
// Promote writes ONLY these public rows; the tenant schema is deferred until someone
// actually owns the listing (no claim flow exists yet). Two columns carry that split:
//   source_job_id / source_agent_id — provenance, and the ON CONFLICT key that makes
//     re-promoting a job reconcile instead of duplicating.
//   schema_provisioned_at — NULL means "no schema exists yet". migrate:tenants skips
//     these, otherwise its CREATE SCHEMA IF NOT EXISTS would eagerly materialise a
//     schema for every promoted listing and defeat the deferral.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("businesses", (t) => {
    t.uuid("source_job_id").nullable();   // -> superadmin.extraction_jobs.id
    t.uuid("source_agent_id").nullable(); // -> superadmin.extraction_agents.id
    t.timestamp("schema_provisioned_at", { useTz: true }).nullable();
  });

  await knex.schema.alterTable("institutions", (t) => {
    t.uuid("source_job_id").nullable();
    t.timestamp("schema_provisioned_at", { useTz: true }).nullable();
    // businesses already has these three; institutions was self-service only until now.
    t.text("claim_status").notNullable().defaultTo("unclaimed"); // unclaimed | claim_pending | claimed
    t.text("claim_token").nullable();
    t.timestamp("claim_token_expires_at").nullable();
  });

  // Every pre-existing tenant was provisioned eagerly at registration.
  await knex("businesses").where("account_status", 1).update({ schema_provisioned_at: knex.fn.now() });
  await knex("institutions").whereNull("deleted_at").update({ schema_provisioned_at: knex.fn.now() });
  // Self-service institutions are owned by a real user who already completed onboarding.
  await knex("institutions").whereNull("deleted_at").update({ claim_status: "claimed" });

  // A job yields at most one primary listing...
  await knex.raw(`
    CREATE UNIQUE INDEX businesses_source_job_uniq ON businesses (source_job_id)
      WHERE source_job_id IS NOT NULL AND source_agent_id IS NULL
  `);
  // ...plus one business per extracted agent, which is its own upsert key.
  await knex.raw(`
    CREATE UNIQUE INDEX businesses_source_agent_uniq ON businesses (source_agent_id)
      WHERE source_agent_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX institutions_source_job_uniq ON institutions (source_job_id)
      WHERE source_job_id IS NOT NULL
  `);

  // Extraction often finds no owner contact at all, so email has to be nullable. The
  // uniqueness guarantee is kept for the rows that do have one, via a partial index.
  // IF EXISTS + an index fallback: knex's column-level .unique() has emitted this as a table
  // constraint in some versions and as a bare unique index in others. A hard DROP CONSTRAINT
  // on the wrong one aborts the whole migration, which rolls back source_job_id too and makes
  // every promote fail with "column source_job_id does not exist".
  await knex.raw(`ALTER TABLE institutions DROP CONSTRAINT IF EXISTS institutions_email_unique`);
  await knex.raw(`DROP INDEX IF EXISTS institutions_email_unique`);
  await knex.raw(`ALTER TABLE institutions ALTER COLUMN email DROP NOT NULL`);
  await knex.raw(`
    CREATE UNIQUE INDEX institutions_email_uniq ON institutions (email)
      WHERE email IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS institutions_email_uniq`);
  await knex.raw(`DROP INDEX IF EXISTS institutions_source_job_uniq`);
  await knex.raw(`DROP INDEX IF EXISTS businesses_source_agent_uniq`);
  await knex.raw(`DROP INDEX IF EXISTS businesses_source_job_uniq`);

  await knex("institutions").whereNull("email").delete();
  await knex.raw(`ALTER TABLE institutions ALTER COLUMN email SET NOT NULL`);
  await knex.raw(`ALTER TABLE institutions ADD CONSTRAINT institutions_email_unique UNIQUE (email)`);

  await knex.schema.alterTable("institutions", (t) => {
    t.dropColumn("claim_token_expires_at");
    t.dropColumn("claim_token");
    t.dropColumn("claim_status");
    t.dropColumn("schema_provisioned_at");
    t.dropColumn("source_job_id");
  });

  await knex.schema.alterTable("businesses", (t) => {
    t.dropColumn("schema_provisioned_at");
    t.dropColumn("source_agent_id");
    t.dropColumn("source_job_id");
  });
}
