import type { Knex } from "knex";

// `issuing_organization_id` is left null — seeding real issuing organizations (CRICOS, TEQSA,
// ASQA, etc. as first-class rows) is a separate follow-up if that linkage is wanted later.
const ACCREDITATIONS = [
  { id: 1, name: "CRICOS Registered", sort_order: 1 },
  { id: 2, name: "TEQSA Accredited", sort_order: 2 },
  { id: 3, name: "ASQA Registered", sort_order: 3 },
  { id: 4, name: "Nationally Recognised Training (NRT)", sort_order: 4 },
  { id: 5, name: "NAATI Certified", sort_order: 5 },
  { id: 6, name: "ISO 9001:2015 Certified", sort_order: 6 },
];

export async function seed(knex: Knex): Promise<void> {
  for (const a of ACCREDITATIONS) {
    const exists = await knex("accreditations").where({ name: a.name }).first();
    if (!exists) {
      await knex("accreditations").insert({
        ...a, issuing_organization_id: null, business_id: null, is_global: true, status: "approved",
      });
    }
  }
  await knex.raw(
    "SELECT setval(pg_get_serial_sequence('accreditations', 'id'), (SELECT MAX(id) FROM accreditations))",
  );
}
