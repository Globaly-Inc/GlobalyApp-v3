// The Accreditations catalog now supplies the business profile's license picker, and that picker
// persists the accreditation's NAME into businesses.registration_licenses. Profiles written
// before this — and the frontend const they were written from — use the bare code "CRICOS", while
// this row was seeded as "CRICOS Registered".
//
// Left alone, the two never meet: an existing CRICOS license matches no option and renders as
// "No longer offered", and picking the catalog row saves a second spelling of the same licence,
// so the same accreditation accumulates under two values. Renaming the row is the cheap side of
// that — no code matches accreditations by name (service links carry accreditation_id), so the
// name is display text, and the bare code matches both the saved data and the ten agent-side
// bodies seeded alongside it (MARA, QEAC, IRCC…).

import type { Knex } from "knex";

const LEGACY = "CRICOS Registered";
const CANONICAL = "CRICOS";
const DESCRIPTION = "Commonwealth Register of Institutions and Courses";
/** Knex's own bookkeeping — `tableName` for the globalyapp env in knexfile.ts. */
const MIGRATIONS_TABLE = "knex_migrations_globalyapp";
const MIGRATION_NAME = "20260921_004_accreditation_cricos_name.ts";

export async function up(knex: Knex): Promise<void> {
  // Guarded: a database that already has a "CRICOS" row would otherwise end up with two.
  const canonical = await knex("accreditations").where({ name: CANONICAL }).whereNull("deleted_at").first();
  if (canonical) return;

  await knex("accreditations")
    .where({ name: LEGACY })
    .update({
      name: CANONICAL,
      // Only where empty — never overwrite an admin's own wording.
      description: knex.raw("COALESCE(description, ?)", [DESCRIPTION]),
      updated_at: knex.fn.now(),
    });
}

/**
 * Reverses only the row `up` actually renamed.
 *
 * A row can be named CRICOS without this migration having touched it, in two ways: a freshly
 * migrated database gets one from accreditations_seeder, which runs AFTER migrations, and a
 * database that already had its own CRICOS row made `up` return early at the guard. Renaming
 * either back would rewrite data this migration never changed — and on a fresh database it would
 * put back the very mismatch the forward migration exists to remove, so the rollback would be the
 * thing that breaks the license picker.
 *
 * The row `up` renamed is identifiable without extra bookkeeping: it existed before this
 * migration ran and was written by it. A seeder-created row is newer than the migration; a row
 * the guard skipped was never written by it.
 */
export async function down(knex: Knex): Promise<void> {
  const record = await knex(MIGRATIONS_TABLE).where({ name: MIGRATION_NAME }).select("migration_time").first();
  // No record means `up` never ran here — there is nothing of ours to reverse.
  if (!record?.migration_time) return;

  await knex("accreditations")
    .where({ name: CANONICAL })
    .where("created_at", "<", record.migration_time)
    .where("updated_at", ">=", record.migration_time)
    // `description` is deliberately left as it is: `up` only ever filled it where it was empty,
    // and the seeder sets the same text, so clearing it here could discard wording this
    // migration did not write.
    .update({ name: LEGACY, updated_at: knex.fn.now() });
}
