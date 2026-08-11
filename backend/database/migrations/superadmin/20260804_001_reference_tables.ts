// Reference/lookup tables — independent of extraction, required before extraction migrations.
// Tables: fee_types, degree_levels, accreditations

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";

  // -- fee_types: canonical fee type lookup --
  await knex.schema.withSchema(s).createTable("fee_types", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("name").notNullable();
    t.text("description").nullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -- degree_levels: canonical qualification levels --
  await knex.schema.withSchema(s).createTable("degree_levels", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("name").notNullable().unique();
    t.integer("rank").notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // -- accreditations: live accreditation bodies --
  await knex.schema.withSchema(s).createTable("accreditations", (t) => {
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

  // -- Seed degree_levels --
  await knex(`${s}.degree_levels`).insert([
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
  ]);
}

export async function down(knex: Knex): Promise<void> {
  const s = "superadmin";
  await knex.schema.withSchema(s).dropTableIfExists("accreditations");
  await knex.schema.withSchema(s).dropTableIfExists("degree_levels");
  await knex.schema.withSchema(s).dropTableIfExists("fee_types");
}
