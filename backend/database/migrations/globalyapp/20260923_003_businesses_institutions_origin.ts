// Records how a listing came to exist — "seeded" (extraction/promote), "admin" (superadmin's
// Add Business/Institution form), or "signup" (self-service registration/onboarding) — so the
// admin UI can distinguish these instead of overloading is_unclaimed (which only tracks whether
// an owner has verified, and both admin- and seed-created listings start unclaimed alike).

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("businesses", (t) => {
    t.text("origin").nullable();
  });
  await knex.schema.alterTable("institutions", (t) => {
    t.text("origin").nullable();
  });

  // Backfill from source_job_id + the job's own source_type — a job isn't only ever a real
  // scrape: onboardInstitution and the admin "Add Business"/"Add Institution" forms each mint
  // their own placeholder job too (source_type 'self_service' / 'manual' respectively), so
  // "has a source_job_id" alone would misclassify both as seeded. Anything with no job at all
  // predates this column and can't be told apart after the fact, so it defaults to "signup" —
  // the common case — rather than guessing "admin" for rows that were mostly self-registered.
  // On a fresh install, globalyapp migrations run BEFORE superadmin's (see README's "Run
  // migrations and seed" step — globalyapp must go first for its own FK reasons), so
  // superadmin.extraction_jobs may not exist yet. A fresh install also has no business/
  // institution rows to backfill, so skipping the join there is a genuine no-op rather than a
  // gap — an existing install with real data to backfill already has that table.
  const { rows } = await knex.raw("SELECT to_regclass('superadmin.extraction_jobs') AS reg");
  const extractionJobsExists = rows[0]?.reg !== null;

  for (const table of ["businesses", "institutions"]) {
    if (extractionJobsExists) {
      await knex.raw(`
        UPDATE ${table} AS t SET origin = CASE j.source_type
          WHEN 'self_service' THEN 'signup'
          WHEN 'manual' THEN 'admin'
          ELSE 'seeded'
        END
        FROM superadmin.extraction_jobs AS j
        WHERE t.source_job_id = j.id
      `);
    }
    // Catches both source_job_id IS NULL and a source_job_id that doesn't match any row in
    // extraction_jobs (e.g. one belonging to a different environment's seed data) — either way
    // the join above left origin unset.
    await knex(table).whereNull("origin").update({ origin: "signup" });
  }

  await knex.schema.alterTable("businesses", (t) => {
    t.text("origin").notNullable().defaultTo("signup").alter();
  });
  await knex.schema.alterTable("institutions", (t) => {
    t.text("origin").notNullable().defaultTo("signup").alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("institutions", (t) => t.dropColumn("origin"));
  await knex.schema.alterTable("businesses", (t) => t.dropColumn("origin"));
}
