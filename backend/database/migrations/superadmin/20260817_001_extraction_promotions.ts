// Promotion ledger — one row per promote attempt of an extraction job.
//
// logAudit() already records that a promote happened, but its details blob is
// free-form and lives in a table the extraction UI does not join. This is the
// queryable answer to "what did this job actually put in the live catalog, into
// whose schema, and what did it refuse to touch" — the audit half of the
// transactional/idempotent/auditable requirement.
//
// `unresolved` is the important column: staged rows promote refused to guess at
// stay in staging and are listed here with a reason, so a second pass can fix
// the reference data and re-promote.
//
// Rows are kept per attempt (not upserted per job): a re-promote after fixing
// reference data should be visible as a second attempt with a smaller unresolved
// list, not silently overwrite the first.

import type { Knex } from "knex";

const S = "superadmin";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).createTable("extraction_promotions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(`${S}.extraction_jobs`).onDelete("CASCADE");

    // Polymorphic org reference — the target may be an unclaimed institution.
    // App-level FK, same precedent as the master cross-tenant tables.
    t.text("target_org_type").notNullable()
      .checkIn(["business", "institution"], "extraction_promotions_target_org_type_check");
    t.integer("target_org_id").notNullable();
    t.uuid("schema_name").notNullable(); // tenant schema written into
    t.boolean("org_created").notNullable().defaultTo(false);
    t.boolean("schema_provisioned").notNullable().defaultTo(false);

    t.integer("promoted_by").nullable(); // superadmin.admin_users.id, app-level FK
    t.boolean("dry_run").notNullable().defaultTo(false);
    t.jsonb("counts").notNullable().defaultTo("{}");
    t.jsonb("unresolved").notNullable().defaultTo("[]");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["job_id", "created_at"], "extraction_promotions_job_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).dropTableIfExists("extraction_promotions");
}
