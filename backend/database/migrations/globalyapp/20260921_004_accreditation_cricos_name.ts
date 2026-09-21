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

export async function down(knex: Knex): Promise<void> {
  await knex("accreditations").where({ name: CANONICAL }).update({ name: LEGACY, updated_at: knex.fn.now() });
}
