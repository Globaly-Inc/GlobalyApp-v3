import type { Knex } from "knex";

// `issuing_organization_id` is left null — seeding real issuing organizations (CRICOS, TEQSA,
// ASQA, etc. as first-class rows) is a separate follow-up if that linkage is wanted later.
//
// Two groups, one table. The first are the institution-side marks a provider holds; the second
// are the advisor/agent registrations that used to live in the frontend as LICENSE_TYPE_OPTIONS.
// They are the same kind of thing — a body that accredits you — so they share the Accreditations
// catalog rather than a second table the admin would have to choose between.
//
// `scope` is an iso2 list resolved to accreditation_scope_countries below. An empty scope means
// the mark is global, matching categories.service.ts: `is_global: scope_country_ids.length === 0`.
const ACCREDITATIONS: { id?: number; name: string; sort_order: number; description?: string; scope?: string[] }[] = [
  // "CRICOS", not "CRICOS Registered": the profile license picker persists this name, and
  // profiles predating the catalog store the bare code. Migration 20260921_004 renames the row
  // on databases seeded before that, so both fresh and existing environments land on one value.
  { id: 1, name: "CRICOS", sort_order: 1, description: "Commonwealth Register of Institutions and Courses" },
  { id: 2, name: "TEQSA Accredited", sort_order: 2 },
  { id: 3, name: "ASQA Registered", sort_order: 3 },
  { id: 4, name: "Nationally Recognised Training (NRT)", sort_order: 4 },
  { id: 5, name: "NAATI Certified", sort_order: 5 },
  { id: 6, name: "ISO 9001:2015 Certified", sort_order: 6 },

  // ── Advisor / agent registrations (ex-LICENSE_TYPE_OPTIONS) ──
  // CRICOS is deliberately absent: it is row 1 above, under the same bare code these use.
  { name: "MARA", sort_order: 10, description: "Migration Agents Registration Authority", scope: ["AU"] },
  { name: "QEAC", sort_order: 11, description: "Qualified Education Agent Counsellor", scope: ["AU"] },
  { name: "PIER", sort_order: 12, description: "Professional International Education Resources", scope: ["AU"] },
  { name: "IRCC", sort_order: 13, description: "Immigration, Refugees and Citizenship Canada", scope: ["CA"] },
  { name: "CICC", sort_order: 14, description: "College of Immigration and Citizenship Consultants", scope: ["CA"] },
  { name: "IAA", sort_order: 15, description: "Immigration Advisers Authority", scope: ["NZ"] },
  { name: "OISC", sort_order: 16, description: "Immigration Advice Authority", scope: ["GB"] },
  { name: "AIRC", sort_order: 17, description: "American International Recruitment Council", scope: ["US"] },
  { name: "ICEF", sort_order: 18, description: "ICEF Agency Status" },
];

export async function seed(knex: Knex): Promise<void> {
  const iso2s = [...new Set(ACCREDITATIONS.flatMap((a) => a.scope ?? []))];
  const countries: { id: number; iso2: string }[] = await knex("countries").select("id", "iso2").whereIn("iso2", iso2s);
  const idByIso2 = new Map(countries.map((c) => [c.iso2, c.id]));

  for (const { scope, ...a } of ACCREDITATIONS) {
    const exists = await knex("accreditations").where({ name: a.name }).first();
    if (exists) continue;
    const [row] = await knex("accreditations")
      .insert({
        ...a,
        issuing_organization_id: null,
        business_id: null,
        is_global: !scope?.length,
        status: "approved",
      })
      .returning("id");

    const countryIds = (scope ?? []).map((iso2) => idByIso2.get(iso2)).filter((id): id is number => id != null);
    if (countryIds.length > 0) {
      await knex("accreditation_scope_countries").insert(
        countryIds.map((country_id) => ({ accreditation_id: row.id, country_id })),
      );
    }
  }

  await knex.raw(
    "SELECT setval(pg_get_serial_sequence('accreditations', 'id'), (SELECT MAX(id) FROM accreditations))",
  );
}
