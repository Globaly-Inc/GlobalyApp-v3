// Point the staged extraction reference columns at the vocabulary the app
// actually uses, and collapse the duplicate that shadowed it.
//
// V3 grew two copies of the same three reference tables:
//
//   superadmin.{fee_types, degree_levels, accreditations}  20260804_001_reference_tables
//   public.{degree_levels, fee_types, accreditations}      20260811_* / the V1 port
//
// The superadmin trio predates the V1 port by a week and is dead weight: no line
// of src/**, frontend/** or docs/** reads it. Every reference read in the app
// goes through the unqualified masterKnex (src/core/db/master-pool.ts sets NO
// searchPath, so it resolves to public) using columns — slug, sort_order,
// deleted_at — that only the public shape has. The tenant tables promote writes
// into (service_fees.fee_type_id, service_eligibility_requirements and
// business_services.degree_level_id) are all `integer`, i.e. public too.
//
// So the staged columns were typed against the wrong copy. 20260805_004 created
// them as uuid with the comment "FK target: public.fee_types(id), add when table
// exists" — the intent was always public, only the placeholder existed at the
// time. public.fee_types(id) / public.degree_levels(id) are serial, so a uuid
// column can never hold one, which is why every imported fee_type_id and all but
// four degree_level_id landed NULL even though V1 had them set.
//
// Two changes:
//
//  1. Retype both columns to integer and add the real cross-schema FK. Existing
//     values are discarded (USING NULL) — the four surviving uuids pointed at the
//     placeholder. database/scripts/backfill-extraction-reference-ids.mjs
//     re-reads them from V1 and writes the integer ids.
//
//  2. Replace superadmin.fee_types / superadmin.degree_levels with views onto
//     public, and drop superadmin.accreditations outright (nothing reads it, and
//     its pre-normalisation text shape has no public equivalent). The views are a
//     compatibility shim for import-v1-extraction.mjs, which resolves its
//     reference names against V3_SCHEMA ("superadmin") where the two lines above
//     it correctly use "public"; through the views it now resolves to the real
//     integer ids with no change to that script. Drop the views once it names
//     public directly.

import type { Knex } from "knex";

const S = "superadmin";

// Placeholder degree levels seeded by 20260804_001, restored verbatim by down().
const PLACEHOLDER_DEGREE_LEVELS = [
  { name: "Certificate I", rank: 1 },
  { name: "Certificate II", rank: 2 },
  { name: "Certificate III", rank: 3 },
  { name: "Certificate IV", rank: 4 },
  { name: "Diploma", rank: 5 },
  { name: "Advanced Diploma", rank: 6 },
  { name: "Associate Degree", rank: 7 },
  { name: "Bachelor", rank: 8 },
  { name: "Bachelor Honours", rank: 9 },
  { name: "Graduate Certificate", rank: 10 },
  { name: "Graduate Diploma", rank: 11 },
  { name: "Master", rank: 12 },
  { name: "Doctorate", rank: 13 },
  { name: "PhD", rank: 14 },
  { name: "Short Course", rank: 0 },
  { name: "Other", rank: 0 },
];

const COLUMNS = [
  {
    table: "extraction_course_fees",
    column: "fee_type_id",
    constraint: "extraction_course_fees_fee_type_id_foreign",
    references: "public.fee_types(id)",
  },
  {
    table: "extraction_eligibility_requirements",
    column: "degree_level_id",
    constraint: "extraction_eligibility_requirements_degree_level_id_foreign",
    references: "public.degree_levels(id)",
  },
] as const;

export async function up(knex: Knex): Promise<void> {
  for (const c of COLUMNS) {
    await knex.raw(`ALTER TABLE ${S}.${c.table} ALTER COLUMN ${c.column} TYPE integer USING NULL::integer`);
    await knex.raw(
      `ALTER TABLE ${S}.${c.table} ADD CONSTRAINT ${c.constraint}
         FOREIGN KEY (${c.column}) REFERENCES ${c.references} ON DELETE SET NULL`,
    );
  }

  await knex.schema.withSchema(S).dropTableIfExists("accreditations");
  await knex.schema.withSchema(S).dropTableIfExists("degree_levels");
  await knex.schema.withSchema(S).dropTableIfExists("fee_types");

  // Compatibility views — id + name is the whole surface the one remaining
  // consumer (import-v1-extraction.mjs v3IdByName) reads.
  await knex.raw(`CREATE VIEW ${S}.fee_types AS SELECT id, name FROM public.fee_types WHERE deleted_at IS NULL`);
  await knex.raw(
    `CREATE VIEW ${S}.degree_levels AS SELECT id, name FROM public.degree_levels WHERE deleted_at IS NULL`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP VIEW IF EXISTS ${S}.degree_levels`);
  await knex.raw(`DROP VIEW IF EXISTS ${S}.fee_types`);

  await knex.schema.withSchema(S).createTable("fee_types", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("name").notNullable();
    t.text("description").nullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema(S).createTable("degree_levels", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("name").notNullable().unique();
    t.integer("rank").notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema(S).createTable("accreditations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("name").notNullable();
    t.text("issuing_organization").nullable();
    t.text("website").nullable();
    t.text("description").nullable();
    t.text("country").nullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex(`${S}.degree_levels`).insert(PLACEHOLDER_DEGREE_LEVELS);

  for (const c of COLUMNS) {
    await knex.raw(`ALTER TABLE ${S}.${c.table} DROP CONSTRAINT IF EXISTS ${c.constraint}`);
    await knex.raw(`ALTER TABLE ${S}.${c.table} ALTER COLUMN ${c.column} TYPE uuid USING NULL::uuid`);
  }
}
