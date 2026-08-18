/**
 * W1.1 — geo reconcile (Part 3 §4 W1).
 *
 * This is NOT a load. The repo's own seeder (mledoze/countries + GeoNames) has
 * already put 194 countries and 2,380 cities into `public`, and V1 carries 198
 * countries and 2,078 cities. So the job is to RECONCILE: match V1 against what
 * is already there on ISO-2, add only what is genuinely missing, and REPORT
 * every V1 country that does not match a seeded row rather than inserting a
 * second copy of a country that is already present under a different spelling.
 *
 * Three deliberate decisions, each of which is the difference between a
 * reconcile and a mess:
 *
 *   1. COUNTRIES ARE MATCHED, NEVER INVENTED. `public.countries.iso3` is NOT
 *      NULL and V1's countries table has no ISO-3 column at all — only a 2-letter
 *      `code`. So a country is inserted only when the OWNER has named its ISO-3:
 *      §15 decision — XK→XKX, PS→PSE, TW→TWN, EH→ESH (ISO3_IMPORTS below), the
 *      four the mledoze seeder does not carry. Names come from V1 verbatim, so
 *      the migration takes no naming position. Anything else that does not match
 *      is still reason-coded `unresolved_country` and left for the owner.
 *   2. ENRICHMENT IS COALESCE-ONLY. V1's countries carry real editorial content
 *      the seeder has none of (about ×198, why_study_here ×98, hero images ×191,
 *      visa detail ×98). It is merged into the matched row only where the seeded
 *      value is absent, so a re-run is a no-op and the seeder's own authoritative
 *      fields (name, iso2, iso3, slug) are never overwritten by free text.
 *   3. CITIES MATCH ON (country_id, normalized name), NOT slug. V1 and V3 slugify
 *      accents differently — `nzerekore` vs `n-zerekore` for the same city — so a
 *      slug match would insert duplicates. The normalized name is the same key
 *      mig.map_cities exposes to every later wave.
 *
 * Usage:
 *   node --import tsx scripts/migration/w1-geo.ts --self-check
 *   node --import tsx scripts/migration/w1-geo.ts            # dry run
 *   node --import tsx scripts/migration/w1-geo.ts --apply
 */

import assert from "node:assert/strict";

import {
  assertTargetColumns,
  clearReport,
  execWrite,
  normKeySql,
  normalizeCountryKey,
  reportUnresolvedQuery,
  runTransform,
  type TransformContext,
} from "./lib.js";

/**
 * The one canonicaliser, shared with the mig resolver views and with
 * normalizeCountryKey() in TypeScript. A geo key that means one thing in the
 * country join and another in the city join is how you get a Sydney in Nova
 * Scotia — and one that strips accents in TS but not in SQL is how 120 accented
 * cities get inserted a second time.
 */
const GEO_KEY = normKeySql;

/** Content columns V1 carries and the seeder does not. Merged COALESCE-only. */
const COUNTRY_ENRICH: readonly string[] = [
  "about",
  "why_study_here",
  "hero_image_url",
  "thumbnail_image_url",
  "visa_type",
  "visa_description",
  "visa_processing_time",
  "visa_fee",
  "avg_tuition_min",
  "avg_tuition_max",
  "avg_tuition_currency",
  "student_count_label",
  "universities_count_label",
  "cost_of_living_label",
  "work_rights_label",
  "weather_summer",
  "weather_autumn",
  "weather_winter",
  "weather_spring",
  "youtube_embed_url",
  "meta_title",
  "meta_description",
];

/**
 * Columns V1 is the ONLY source for on a country the seeder never had. Written
 * on INSERT only: on a matched row the seeder stays authoritative (decision 2),
 * so these never appear in the COALESCE-only enrichment above.
 *
 * `region` is derived from V1's `continent`, but only where the two vocabularies
 * already agree. mledoze says "Americas" where V1 says "North America" /
 * "South America"; translating that would be a mapping nobody asked for, and all
 * four imported countries are Europe/Asia/Africa anyway.
 */
const COUNTRY_INSERT_ONLY: readonly { column: string; expr: string }[] = [
  { column: "flag_emoji", expr: "v.flag_emoji" },
  { column: "capital", expr: "v.capital" },
  { column: "currency", expr: "v.currency" },
  { column: "languages", expr: "v.languages" },
  { column: "timezone", expr: "v.timezone" },
  { column: "is_active", expr: "coalesce(v.is_active, true)" },
  { column: "region", expr: `(CASE WHEN v.continent IN ('Africa', 'Americas', 'Asia', 'Europe', 'Oceania') THEN v.continent END)` },
];

/**
 * The ISO-3 codes the owner assigned to the four V1 countries mledoze/countries
 * does not ship (§15). A closed list on purpose: `public.countries.iso3` is NOT
 * NULL, and "derive an ISO-3 for whatever V1 happens to carry" is how a
 * transform starts inventing country rows nobody approved.
 *
 * `official: false` is reported on EVERY run, not once — same convention as
 * database/scripts/migrate-lib.mjs NON_OFFICIAL_ISO3. Kosovo has no ISO 3166-1
 * code at all; XK/XKX are user-assigned (World Bank convention).
 */
export const ISO3_IMPORTS: readonly { iso2: string; iso3: string; official: boolean; note?: string }[] = [
  { iso2: "XK", iso3: "XKX", official: false, note: "Kosovo has no ISO 3166-1 code; XK/XKX are user-assigned (World Bank convention)" },
  { iso2: "PS", iso3: "PSE", official: true },
  { iso2: "TW", iso3: "TWN", official: true },
  { iso2: "EH", iso3: "ESH", official: true },
];

/**
 * The destinations shelf. NOT enrichment, and the difference is the whole point:
 * both columns are NOT NULL with defaults (false / 0), so a seeded row never holds
 * a NULL for the COALESCE-only merge above to fill. Listing them there would have
 * looked like carrying them and carried nothing — which is exactly what happened:
 * V1 flags 8 countries with sort_order 0-2 and all 8 landed featured = false,
 * sort_order = 0, leaving GET /api/v3/countries/featured returning an empty shelf.
 *
 * Scoped to the countries V1 actually features (§1.2.1 parity-first: V1 is the only
 * source of this editorial there is — the seeder has no opinion and features none).
 * A V3 country V1 never mentions is not touched at all: un-featuring rows is not
 * what carrying a flag across means, and it is the one way this write could destroy
 * something.
 */
const COUNTRY_FEATURED: readonly string[] = ["is_featured", "sort_order"];

const CITY_COLUMNS: readonly string[] = [
  "country_id",
  "name",
  "slug",
  "hero_image_url",
  "thumbnail_image_url",
  "about",
  "population_label",
  "area_label",
  "weather_label",
  "timezone",
  "highlights",
  "is_featured",
  "sort_order",
  "status",
  "meta_title",
  "meta_description",
];

/**
 * V1 countries resolved against what is already in `public.countries`.
 *
 * ISO-2 first (`priority` 1 in mig.map_countries), then the country name — both
 * through the shared normalisation, which is what absorbs "VIET NAM" vs
 * "Viet Nam" and the ISO-3 spellings (defect D7).
 */
const RESOLVED_COUNTRIES = `
  SELECT v.id AS v1_id, v.code, v.name,
         coalesce(mc.id, mn.id) AS v3_id
    FROM v1_staging.countries v
    LEFT JOIN mig.map_countries mc ON mc.key = ${GEO_KEY("v.code")}
    LEFT JOIN mig.map_countries mn ON mn.key = ${GEO_KEY("v.name")}
`;

/**
 * V1 cities, carrying the country they resolved to and a deterministic rank
 * within (country, normalized name).
 *
 * `rn > 1` is V1's own in-source duplicate — Nzérékoré appears twice under
 * Guinea with two different slugs. Ordering by id makes "which one wins" a
 * decision rather than a race, and the loser is reported rather than dropped.
 */
const RESOLVED_CITIES = `
  SELECT ci.id AS v1_id, ci.name, ci.slug, rc.v3_id AS country_id,
         lower(btrim(rc.code)) || '|' || ${GEO_KEY("ci.name")} AS identity_key,
         ${GEO_KEY("ci.name")} AS name_key,
         row_number() OVER (PARTITION BY rc.v3_id, ${GEO_KEY("ci.name")} ORDER BY ci.id) AS rn,
         ci.hero_image_url, ci.thumbnail_image_url, ci.about, ci.population_label,
         ci.area_label, ci.weather_label, ci.timezone,
         coalesce(ci.highlights, '{}'::text[]) AS highlights,
         coalesce(ci.is_featured, false) AS is_featured,
         coalesce(ci.sort_order, 0) AS sort_order,
         coalesce(nullif(btrim(ci.status), ''), 'active') AS status,
         ci.meta_title, ci.meta_description
    FROM v1_staging.cities ci
    JOIN (${RESOLVED_COUNTRIES}) rc ON rc.v1_id = ci.country_id
   WHERE rc.v3_id IS NOT NULL
`;

export async function transformGeo(ctx: TransformContext, allowedCodes: ReadonlySet<string>): Promise<void> {
  await assertTargetColumns(ctx.db, "public", "countries", ["iso2", ...COUNTRY_ENRICH, ...COUNTRY_FEATURED]);
  await assertTargetColumns(ctx.db, "public", "cities", [...CITY_COLUMNS]);
  await clearReport(ctx, ["countries", "cities"]);

  // ── countries: the four owner-approved imports ─────────────────────────────
  // Only the ISO3_IMPORTS codes, and only when nothing already occupies any of
  // countries' four UNIQUE columns (iso2, iso3, name, slug). That guard — not
  // the ON CONFLICT — is what makes this idempotent: a second run inserts
  // nothing, and no unique can be violated instead of being caught.
  const importColumns = ["name", "iso2", "iso3", "slug", ...COUNTRY_INSERT_ONLY.map((c) => c.column), ...COUNTRY_ENRICH];
  const importValues = [
    "v.name",
    "upper(btrim(v.code))",
    "iso.iso3",
    "v.slug",
    ...COUNTRY_INSERT_ONLY.map((c) => c.expr),
    ...COUNTRY_ENRICH.map((c) => `v.${c}`),
  ];
  const isoValues = ISO3_IMPORTS.map((i) => `('${i.iso2}', '${i.iso3}')`).join(", ");
  await assertTargetColumns(ctx.db, "public", "countries", importColumns);
  await execWrite(
    ctx,
    "public.countries (imported)",
    `INSERT INTO public.countries (${importColumns.join(", ")})
     SELECT ${importValues.join(", ")}
       FROM v1_staging.countries v
       JOIN (VALUES ${isoValues}) AS iso(iso2, iso3) ON iso.iso2 = upper(btrim(v.code))
      WHERE NOT EXISTS (
              SELECT 1 FROM public.countries c
               WHERE c.iso2 = upper(btrim(v.code))
                  OR c.iso3 = iso.iso3
                  OR lower(btrim(c.name)) = lower(btrim(v.name))
                  OR c.slug = v.slug)
     ON CONFLICT (iso2) DO NOTHING`,
  );

  // Reported every run, not once: a user-assigned code that silently looks
  // official is exactly the kind of fact that stops being said out loud.
  for (const i of ISO3_IMPORTS.filter((x) => !x.official)) {
    ctx.report.notes.push(`${i.iso2} -> ${i.iso3} is NOT an ISO 3166-1 code — ${i.note}`);
  }

  // ── countries ──────────────────────────────────────────────────────────────
  // Everything else is matched and enriched in place, never inserted, so
  // `matched` and `reported` must add up to the staged rows for the wave to be
  // honest.
  const enrich = COUNTRY_ENRICH.map((c) => `${c} = coalesce(t.${c}, r.${c})`).join(",\n           ");
  await execWrite(
    ctx,
    "public.countries (enriched)",
    `UPDATE public.countries t
        SET ${enrich},
            updated_at = now()
       FROM (SELECT rc.v3_id, v.* FROM (${RESOLVED_COUNTRIES}) rc JOIN v1_staging.countries v ON v.id = rc.v1_id) r
      WHERE t.id = r.v3_id
        AND (${COUNTRY_ENRICH.map((c) => `(t.${c} IS NULL AND r.${c} IS NOT NULL)`).join(" OR ")})`,
  );

  // The featured shelf. See COUNTRY_FEATURED: a separate statement because COALESCE
  // cannot reach a NOT NULL DEFAULT column. The WHERE is what makes it idempotent —
  // a second --apply finds both values already equal and writes 0 rows.
  await execWrite(
    ctx,
    "public.countries (featured)",
    `UPDATE public.countries t
        SET is_featured = true,
            sort_order  = r.sort_order,
            updated_at  = now()
       FROM (SELECT rc.v3_id, coalesce(v.sort_order, 0) AS sort_order
               FROM (${RESOLVED_COUNTRIES}) rc
               JOIN v1_staging.countries v ON v.id = rc.v1_id
              WHERE rc.v3_id IS NOT NULL AND coalesce(v.is_featured, false)) r
      WHERE t.id = r.v3_id
        AND (t.is_featured IS DISTINCT FROM true OR t.sort_order IS DISTINCT FROM r.sort_order)`,
  );

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "countries",
    targetTable: "public.countries",
    column: "iso2",
    reasonCode: "unresolved_country",
    sql: `SELECT lower(btrim(r.code)),
                 'V1 ' || r.code || ' / ' || r.name || ' matches no country on ISO-2, ISO-3 or name, and is not in ISO3_IMPORTS. '
                 || 'public.countries.iso3 is NOT NULL and V1 carries no ISO-3, so inserting it would mean inventing one — owner decision.'
            FROM (${RESOLVED_COUNTRIES}) r WHERE r.v3_id IS NULL`,
  });

  // ── cities ─────────────────────────────────────────────────────────────────
  // A V1 city whose country did not resolve has nowhere to go: cities.country_id
  // is NOT NULL, and guessing the country is how a city ends up on the wrong
  // continent. Reported, never defaulted.
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "cities",
    targetTable: "public.cities",
    column: "country_id",
    reasonCode: "unresolved_country",
    sql: `SELECT lower(btrim(co.code)) || '|' || ${GEO_KEY("ci.name")}, 'country ' || co.code || ' / ' || co.name || ' did not resolve, so the city has no country_id'
            FROM v1_staging.cities ci
            JOIN v1_staging.countries co ON co.id = ci.country_id
            JOIN (${RESOLVED_COUNTRIES}) rc ON rc.v1_id = ci.country_id
           WHERE rc.v3_id IS NULL`,
  });

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "cities",
    targetTable: "public.cities",
    column: "name",
    reasonCode: "duplicate_natural_key",
    sql: `SELECT c.identity_key, 'V1 lists ' || c.name || ' twice under the same country (slug ' || c.slug || '); the lowest V1 id wins'
            FROM (${RESOLVED_CITIES}) c WHERE c.rn > 1`,
  });

  // A V1 city whose slug collides with a DIFFERENT existing city in the same
  // country: (country_id, slug) is UNIQUE, so ON CONFLICT DO UPDATE would
  // silently rename the incumbent. Reported instead.
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "cities",
    targetTable: "public.cities",
    column: "slug",
    reasonCode: "duplicate_natural_key",
    sql: `SELECT c.identity_key, 'slug ' || c.slug || ' is already taken in this country by a different city (' || x.name || ')'
            FROM (${RESOLVED_CITIES}) c
            JOIN public.cities x ON x.country_id = c.country_id AND x.slug = c.slug
           WHERE c.rn = 1
             AND ${GEO_KEY("x.name")} <> c.name_key`,
  });

  // Only genuinely new cities are inserted. "New" is decided on the normalized
  // NAME, not the slug: the seeder slugifies accents as `nzerekore` where V1
  // writes `n-zerekore`, so a slug-keyed insert would add a second Nzérékoré
  // next to the one that is already there.
  const ALREADY_PRESENT = `SELECT 1 FROM public.cities x
                            WHERE x.country_id = c.country_id AND ${GEO_KEY("x.name")} = c.name_key`;
  const SLUG_TAKEN = `SELECT 1 FROM public.cities x
                       WHERE x.country_id = c.country_id AND x.slug = c.slug AND ${GEO_KEY("x.name")} <> c.name_key`;

  await execWrite(
    ctx,
    "public.cities",
    `INSERT INTO public.cities (${CITY_COLUMNS.join(", ")})
     SELECT ${CITY_COLUMNS.map((c) => `c.${c}`).join(", ")}
       FROM (${RESOLVED_CITIES}) c
      WHERE c.rn = 1
        AND NOT EXISTS (${ALREADY_PRESENT})
        AND NOT EXISTS (${SLUG_TAKEN})
     ON CONFLICT (country_id, slug) DO NOTHING`,
  );

  // Cities the seeder already had: merged COALESCE-only, same rule as countries.
  await execWrite(
    ctx,
    "public.cities (enriched)",
    `UPDATE public.cities t
        SET hero_image_url      = coalesce(t.hero_image_url, c.hero_image_url),
            thumbnail_image_url = coalesce(t.thumbnail_image_url, c.thumbnail_image_url),
            about               = coalesce(t.about, c.about),
            population_label    = coalesce(t.population_label, c.population_label),
            area_label          = coalesce(t.area_label, c.area_label),
            weather_label       = coalesce(t.weather_label, c.weather_label),
            timezone            = coalesce(t.timezone, c.timezone),
            meta_title          = coalesce(t.meta_title, c.meta_title),
            meta_description    = coalesce(t.meta_description, c.meta_description),
            updated_at          = now()
       FROM (${RESOLVED_CITIES}) c
      WHERE c.rn = 1
        AND t.country_id = c.country_id
        AND ${GEO_KEY("t.name")} = c.name_key
        AND (t.hero_image_url IS NULL AND c.hero_image_url IS NOT NULL
          OR t.thumbnail_image_url IS NULL AND c.thumbnail_image_url IS NOT NULL
          OR t.about IS NULL AND c.about IS NOT NULL
          OR t.population_label IS NULL AND c.population_label IS NOT NULL
          OR t.area_label IS NULL AND c.area_label IS NOT NULL
          OR t.weather_label IS NULL AND c.weather_label IS NOT NULL
          OR t.timezone IS NULL AND c.timezone IS NOT NULL
          OR t.meta_title IS NULL AND c.meta_title IS NOT NULL
          OR t.meta_description IS NULL AND c.meta_description IS NOT NULL)`,
  );
}

export function geoSelfCheck(): void {
  // The SQL key and the TypeScript key must agree on the cases that actually
  // occur in V1 — accents above all. These are the pairs that produced 120
  // would-be duplicate cities before the SQL side learned to strip them.
  assert.equal(normalizeCountryKey("São Paulo"), normalizeCountryKey("Sao Paulo"));
  assert.equal(normalizeCountryKey("Nzérékoré"), "nzerekore");
  assert.equal(normalizeCountryKey("Durrës"), normalizeCountryKey("Durres"));
  assert.ok(GEO_KEY("x").includes("NFKD"), "the SQL key must decompose before stripping marks");
  assert.ok(GEO_KEY("x").includes("[^a-z0-9]+"), "…and collapse the rest to single spaces");
  assert.ok(COUNTRY_ENRICH.length > 0 && !COUNTRY_ENRICH.includes("name"), "the seeder's authoritative name is never overwritten");
  assert.ok(!COUNTRY_ENRICH.includes("iso2") && !COUNTRY_ENRICH.includes("iso3") && !COUNTRY_ENRICH.includes("slug"));
  // The featured shelf must never be folded into the COALESCE-only enrichment:
  // is_featured and sort_order are NOT NULL with defaults, so a COALESCE would be a
  // no-op that reads like a migration. That mistake is what emptied the shelf.
  assert.deepEqual([...COUNTRY_FEATURED], ["is_featured", "sort_order"]);
  assert.equal(
    COUNTRY_ENRICH.filter((c) => COUNTRY_FEATURED.includes(c)).length,
    0,
    "a NOT NULL DEFAULT column cannot be carried by COALESCE — it needs its own statement",
  );
  assert.equal(COUNTRY_INSERT_ONLY.filter((c) => COUNTRY_FEATURED.includes(c.column)).length, 0);
  assert.ok(CITY_COLUMNS.includes("country_id") && CITY_COLUMNS.includes("slug"), "the city natural key must be written");
  assert.ok(new Set(CITY_COLUMNS).size === CITY_COLUMNS.length, "duplicate column in the city insert");

  // The owner-assigned ISO-3s. A closed list of exactly four, each a real
  // alpha-3, and Kosovo flagged as the one that is not ISO-official.
  assert.deepEqual(
    ISO3_IMPORTS.map((i) => `${i.iso2}:${i.iso3}`),
    ["XK:XKX", "PS:PSE", "TW:TWN", "EH:ESH"],
    "the imported ISO-3s are an owner decision, not something the transform derives",
  );
  assert.ok(ISO3_IMPORTS.every((i) => /^[A-Z]{2}$/.test(i.iso2) && /^[A-Z]{3}$/.test(i.iso3)));
  assert.deepEqual(ISO3_IMPORTS.filter((i) => !i.official).map((i) => i.iso2), ["XK"]);
  assert.ok(ISO3_IMPORTS.filter((i) => !i.official).every((i) => (i.note ?? "").length > 20), "a non-official code must say why on every run");
  // The insert-only set and the enrich set must not overlap: a column in both
  // would be written on insert and then quietly re-decided by the COALESCE.
  const insertOnly = new Set(COUNTRY_INSERT_ONLY.map((c) => c.column));
  assert.equal(COUNTRY_ENRICH.filter((c) => insertOnly.has(c)).length, 0);
  assert.ok(!insertOnly.has("name") && !insertOnly.has("iso2") && !insertOnly.has("iso3") && !insertOnly.has("slug"));

  console.log(
    `w1-geo self-check: ok — ${COUNTRY_ENRICH.length} enrich columns, ${COUNTRY_FEATURED.length} featured columns, ` +
      `${CITY_COLUMNS.length} city columns, ` +
      `${ISO3_IMPORTS.length} owner-assigned ISO-3 imports`,
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await runTransform({ wave: "W1-geo", body: transformGeo, selfCheck: geoSelfCheck }));
}
