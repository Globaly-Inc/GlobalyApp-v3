// Loads the full V1 geography into V3: countries (24 -> 198) and cities (332 -> 2078).
//
//   node database/scripts/import-v1-geo.mjs               # dry run (default)
//   node database/scripts/import-v1-geo.mjs --apply       # write
//   node database/scripts/import-v1-geo.mjs --self-check  # pure-fn asserts, no DB
//
// Why this runs before anything else: buildCountryResolver() returns null for a
// country V3 has never heard of, so with only 24 seeded countries every migrated
// nationality / country_of_residence / business country that did not happen to be
// in the curated set was written as NULL. Load all 198, then run
// backfill-country-fks.mjs to repair the rows already imported.
//
// Idempotent: countries upsert on iso2, cities on (country_id, lower(name)).
// Curated V3 values are never clobbered — an existing row only gets its NULL
// columns filled, and any name divergence is reported instead of overwritten.

import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

import { normalizeCountry } from "./recon-v2-users.mjs";
import {
  deriveIso3,
  parseArgs,
  printList,
  tableColumns,
  upsertBy,
  withMigration,
} from "./migrate-lib.mjs";

// V1 columns this importer reads. Everything else on those tables is CMS payload
// with no V3 column; the leftovers are computed at runtime and reported.
const COUNTRY_COLUMNS_READ = ["id", "code", "name", "continent", "flag_emoji", "currency"];
const CITY_COLUMNS_READ = ["id", "country_id", "name"];

// ── Pure helpers (covered by --self-check and tests/unit/migrate-lib.test.ts) ─

/** V1 countries.continent -> V3 countries.region. Same vocabulary, different column. */
export function toRegion(continent) {
  const v = typeof continent === "string" ? continent.trim() : "";
  return v === "" ? null : v;
}

/** Dedupe key for cities: V3 has no unique constraint, so the importer owns it. */
export function cityKey(countryId, name) {
  return `${countryId}::${normalizeCountry(name) ?? ""}`;
}

// ── Source ──────────────────────────────────────────────────────────────────

async function fetchCountries(v1) {
  const { rows } = await v1.query(
    `SELECT id::text AS uuid, upper(trim(code)) AS iso2, name, continent, flag_emoji, currency
       FROM public.countries
      WHERE code IS NOT NULL AND trim(code) <> ''
      ORDER BY code`,
  );
  return rows;
}

async function fetchCities(v1) {
  const { rows } = await v1.query(
    `SELECT c.id::text AS uuid, c.name, upper(trim(co.code)) AS country_iso2
       FROM public.cities c
       JOIN public.countries co ON co.id = c.country_id
      WHERE co.code IS NOT NULL AND trim(co.code) <> ''
      ORDER BY co.code, c.name`,
  );
  return rows;
}

/** Fields the V1 table carries that this load has nowhere to put. Computed, not
 *  hand-maintained, so a source schema change shows up in the report. */
async function droppedColumns(v1, table, read) {
  const { rows } = await v1.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((r) => r.column_name).filter((c) => !read.includes(c));
}

// ── Load ────────────────────────────────────────────────────────────────────

async function loadCountries(v1, v3, report) {
  const source = await fetchCountries(v1);
  report.countriesSource = source.length;
  const hasColumn = await tableColumns(v3, "public", "countries");

  const { rows: existing } = await v3.query(`SELECT id, name, iso2 FROM public.countries`);
  const idByIso2 = new Map(existing.map((r) => [r.iso2, r.id]));
  const nameByIso2 = new Map(existing.map((r) => [r.iso2, r.name]));
  const iso2ByName = new Map(existing.map((r) => [r.name, r.iso2]));

  for (const row of source) {
    const iso3 = deriveIso3(row.iso2);
    if (!iso3) {
      // iso3 is NOT NULL — a country we cannot code cannot be inserted. Report it.
      report.unresolvedIso3.push({ iso2: row.iso2, name: row.name });
      continue;
    }
    if (iso3.note) report.nonOfficialIso3.push({ iso2: row.iso2, iso3: iso3.iso3, note: iso3.note });

    const region = toRegion(row.continent);
    const known = idByIso2.get(row.iso2);

    if (known !== undefined) {
      // Curated row: fill the blanks, keep the curated name, report divergence.
      const currentName = nameByIso2.get(row.iso2);
      if (currentName !== row.name) {
        report.nameDivergences.push({ iso2: row.iso2, v3: currentName, v1: row.name });
      }
      const sets = [`region = coalesce(region, $1)`, `currency = coalesce(currency, $2)`];
      const params = [region, row.currency ?? null];
      if (hasColumn.has("flag_emoji")) {
        sets.push(`flag_emoji = coalesce(flag_emoji, $${params.length + 1})`);
        params.push(row.flag_emoji ?? null);
      }
      params.push(known);
      await v3.query(`UPDATE public.countries SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
      report.countriesUpdated++;
      continue;
    }

    // A brand new country whose V1 name is already taken by a different ISO-2 would
    // violate countries_name_unique. Report the clash rather than renaming either row.
    const clashIso2 = iso2ByName.get(row.name);
    if (clashIso2 !== undefined && clashIso2 !== row.iso2) {
      report.nameClashes.push({ iso2: row.iso2, name: row.name, heldBy: clashIso2 });
      continue;
    }

    const values = {
      name: row.name,
      iso2: row.iso2,
      iso3: iso3.iso3,
      region,
      currency: row.currency ?? null,
    };
    if (hasColumn.has("flag_emoji")) values.flag_emoji = row.flag_emoji ?? null;

    const { id } = await upsertBy(v3, "public.countries", { iso2: row.iso2 }, values);
    idByIso2.set(row.iso2, id);
    iso2ByName.set(row.name, row.iso2);
    report.countriesInserted++;
  }

  if (!hasColumn.has("flag_emoji")) report.droppedCountryFields.push("flag_emoji (no V3 column)");
  return idByIso2;
}

async function loadCities(v1, v3, idByIso2, report) {
  const source = await fetchCities(v1);

  const { rows: existing } = await v3.query(`SELECT id, country_id, name FROM public.cities`);
  const seen = new Set(existing.map((r) => cityKey(r.country_id, r.name)));

  for (const row of source) {
    const countryId = idByIso2.get(row.country_iso2);
    if (countryId === undefined) {
      report.citiesWithoutCountry.push({ name: row.name, iso2: row.country_iso2 });
      continue;
    }
    const key = cityKey(countryId, row.name);
    if (seen.has(key)) {
      // Either already in V3, or a duplicate inside the V1 source itself.
      report.citiesSkipped++;
      continue;
    }
    await v3.query(`INSERT INTO public.cities (country_id, name) VALUES ($1, $2)`, [countryId, row.name]);
    seen.add(key);
    report.citiesInserted++;
  }
  report.citiesSource = source.length;
}

// ── Self-check ──────────────────────────────────────────────────────────────

function selfCheck() {
  assert.equal(toRegion(" Oceania "), "Oceania");
  assert.equal(toRegion(""), null);
  assert.equal(toRegion(null), null);

  assert.equal(cityKey(1, "Sydney"), cityKey(1, " sydney "));
  assert.notEqual(cityKey(1, "Sydney"), cityKey(2, "Sydney"));

  // The three codes the first recon failed to resolve.
  assert.equal(deriveIso3("AU").iso3, "AUS");
  assert.equal(deriveIso3("HR").iso3, "HRV");
  assert.equal(deriveIso3("NP").iso3, "NPL");
  assert.equal(deriveIso3(" np ").iso3, "NPL");
  assert.equal(deriveIso3("ZZ"), null);
  assert.equal(deriveIso3(null), null);
  // Kosovo is user-assigned, and says so.
  assert.equal(deriveIso3("XK").official, false);
  assert.equal(deriveIso3("AU").official, true);

  console.log("self-check: all assertions passed");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfCheck) return selfCheck();

  const report = {
    countriesSource: 0,
    countriesInserted: 0,
    countriesUpdated: 0,
    citiesSource: 0,
    citiesInserted: 0,
    citiesSkipped: 0,
    unresolvedIso3: [],
    nonOfficialIso3: [],
    nameDivergences: [],
    nameClashes: [],
    citiesWithoutCountry: [],
    droppedCountryFields: [],
    droppedCityFields: [],
  };

  await withMigration({ apply: args.apply, label: "V1 -> V3 geography import" }, async (v1, v3) => {
    const idByIso2 = await loadCountries(v1, v3, report);
    await loadCities(v1, v3, idByIso2, report);

    report.droppedCountryFields.push(...(await droppedColumns(v1, "countries", COUNTRY_COLUMNS_READ)));
    report.droppedCityFields.push(...(await droppedColumns(v1, "cities", CITY_COLUMNS_READ)));

    const { rows: totals } = await v3.query(
      `SELECT (SELECT count(*)::int FROM public.countries) AS countries,
              (SELECT count(*)::int FROM public.cities)    AS cities`,
    );
    report.totals = totals[0];
  });

  console.log(`countries source:   ${report.countriesSource}`);
  console.log(`countries inserted: ${report.countriesInserted}`);
  console.log(`countries updated:  ${report.countriesUpdated}`);
  console.log(`cities source:      ${report.citiesSource}`);
  console.log(`cities inserted:    ${report.citiesInserted}`);
  console.log(`cities skipped (already present / duplicate in source): ${report.citiesSkipped}`);
  if (report.totals) console.log(`in-transaction totals: ${report.totals.countries} countries, ${report.totals.cities} cities`);

  printList("UNRESOLVED iso3 (not loaded)", report.unresolvedIso3, (r) => `${r.iso2} ${r.name}`);
  printList("non-official iso3 used", report.nonOfficialIso3, (r) => `${r.iso2} -> ${r.iso3}: ${r.note}`);
  printList("NAME CLASHES (not loaded)", report.nameClashes, (r) => `${r.iso2} "${r.name}" already held by ${r.heldBy}`);
  printList("name divergences (V3 curated name kept)", report.nameDivergences, (r) => `${r.iso2}: V3="${r.v3}" V1="${r.v1}"`);
  printList("cities with no country", report.citiesWithoutCountry, (r) => `${r.name} (${r.iso2})`);
  printList("V1 country fields with no V3 column (dropped)", report.droppedCountryFields, (c) => c);
  printList("V1 city fields with no V3 column (dropped)", report.droppedCityFields, (c) => c);

  if (args.json) console.log(JSON.stringify(report, null, 2));
}

// Only run when invoked directly — the tests import the pure helpers above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
