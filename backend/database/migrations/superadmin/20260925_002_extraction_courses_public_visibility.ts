// Institution courses had no per-section public/private control — the editor's "Public" badges
// (Description/Fees/Intakes/Eligibility/Study Units/Accreditations/Media) were purely cosmetic.
// Mirrors business_services.public_visibility (database/migrations/business/20260824_001_service_details_family.ts):
// a jsonb map, `{}` (i.e. everything public) by default, keyed by section.

import type { Knex } from "knex";

const S = "superadmin";
const TABLE = "extraction_courses";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.jsonb("public_visibility").notNullable().defaultTo("{}");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.dropColumn("public_visibility");
  });
}
