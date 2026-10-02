import type { Knex } from "knex";

// The set that shipped in the frontend as COUNTRY_REGISTRATION_TYPES. Keyed by iso2 rather than
// country name: the name is display text that can be re-spelled upstream, the code can't.
const BY_COUNTRY: Record<string, { code: string; label: string }[]> = {
  AU: [{ code: "ABN", label: "ABN (11 digits)" }, { code: "ACN", label: "ACN (9 digits)" }],
  US: [{ code: "EIN", label: "EIN (XX-XXXXXXX)" }],
  GB: [{ code: "Company Number", label: "Company Number (8 characters)" }],
  CA: [{ code: "BN", label: "Business Number (BN)" }],
  NZ: [{ code: "NZBN", label: "NZBN (13 digits)" }],
  IN: [{ code: "CIN", label: "CIN" }, { code: "GSTIN", label: "GSTIN (15 characters)" }],
  SG: [{ code: "UEN", label: "UEN (9-10 characters)" }],
};

// country_id NULL — offered to any country without rows of its own (old DEFAULT_REGISTRATION_TYPES).
const GENERIC = [{ code: "Business Registration Number", label: "Business Registration Number" }];

export async function seed(knex: Knex): Promise<void> {
  const countries: { id: number; iso2: string }[] = await knex("countries")
    .select("id", "iso2")
    .whereIn("iso2", Object.keys(BY_COUNTRY));
  const idByIso2 = new Map(countries.map((c) => [c.iso2, c.id]));

  const rows = [
    ...Object.entries(BY_COUNTRY).flatMap(([iso2, types]) => {
      const country_id = idByIso2.get(iso2);
      // Countries are seeded from world-countries.json before this runs; a missing one means that
      // seeder hasn't run, and silently skipping beats inserting the row against no country.
      if (!country_id) return [];
      return types.map((t, i) => ({ ...t, country_id, sort_order: i + 1 }));
    }),
    ...GENERIC.map((t, i) => ({ ...t, country_id: null, sort_order: i + 1 })),
  ];

  for (const row of rows) {
    // Matches the partial unique index: one live row per (country, code), NULL country included.
    const exists = await knex("business_registration_types")
      .where({ code: row.code })
      .where(row.country_id === null ? knex.raw("country_id IS NULL") : { country_id: row.country_id })
      .whereNull("deleted_at")
      .first();
    if (!exists) await knex("business_registration_types").insert(row);
  }
}
