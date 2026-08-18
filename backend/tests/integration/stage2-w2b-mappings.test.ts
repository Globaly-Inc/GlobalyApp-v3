// The four §15 mapping decisions, proven against the real Stage-1 DDL.
//
// Each of these is a place where "the transform ran" and "the transform did the
// right thing" are different claims, so the suite checks the second one:
//
//   the four imported countries   XK/PS/TW/EH are INSERTED under the ISO-3s the
//                                 owner assigned, their cities follow, and the
//                                 user-assigned Kosovo code is said out loud on
//                                 every run rather than once in a comment
//   schema_fields from jsonb      one row per array element, entity_id from the
//                                 owning category, `multi-select` normalised,
//                                 and a jsonb key V3 has no column for reported
//                                 instead of quietly stuffed into `options`
//   the duplicate-key guard       two definitions of one key in one array is the
//                                 case that makes ON CONFLICT DO UPDATE throw
//                                 "cannot affect row a second time" — it must be
//                                 reported, and the wave must still be green
//   test_provider_logos           loads into the new public reference table with
//                                 the supabase.co URL carried VERBATIM (W6 is
//                                 what rewrites it), and a category V3's CHECK
//                                 would reject is reason-coded, not a crash

import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { dbAvailable } from "../helpers/db.js";
import { testDatabaseUrl } from "../setup/db-url.js";

const execFileAsync = promisify(execFile);
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STAGING_DDL = path.join(BACKEND_ROOT, "scripts/migration/v1-staging.sql");
const script = (name: string) => path.join(BACKEND_ROOT, "scripts/migration", name);

// Distinctive fixture ids so the cleanup can find every row it created.
const C_KOSOVO = "e1e1e1e1-0000-4000-8000-000000000001";
const C_SEEDED = "e1e1e1e1-0000-4000-8000-000000000002";
const BIZ_CAT = "e2e2e2e2-0000-4000-8000-000000000001";
const SVC_CAT = "e2e2e2e2-0000-4000-8000-000000000002";
const SVC_CAT_DUP = "e2e2e2e2-0000-4000-8000-000000000003";
const LOGO_OK = "e3e3e3e3-0000-4000-8000-000000000001";
const LOGO_BAD = "e3e3e3e3-0000-4000-8000-000000000002";

const BIZ_SLUG = "w2b-education-agency";
const SVC_SLUG = "w2b-courses";
const SVC_DUP_SLUG = "w2b-repeats";
const LOGO_URL = "https://irhwtbyvrbaublgxvpfp.supabase.co/storage/v1/object/public/business-assets/test-logos/W2B.png";

interface RunReport {
  wave: string;
  written: Record<string, number>;
  unresolved: { reasonCode: string; column?: string | null }[];
  notes: string[];
  error: string | null;
}

async function runTransform(file: string, apply: boolean): Promise<RunReport> {
  const args = ["--import", "tsx", script(file), "--json", `--url=${testDatabaseUrl()}`];
  if (apply) args.push("--apply");
  const { stdout } = await execFileAsync(process.execPath, args, { cwd: BACKEND_ROOT, maxBuffer: 32 * 1024 * 1024 });
  const report = JSON.parse(stdout) as RunReport;
  if (report.error) throw new Error(`${file} failed: ${report.error}`);
  return report;
}

const describeDb = describe.skipIf(!dbAvailable);

describeDb("Stage 2 — the §15 mapping decisions", () => {
  let db: pg.Client;

  beforeAll(async () => {
    db = new pg.Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    const { readFile } = await import("node:fs/promises");
    await db.query(await readFile(STAGING_DDL, "utf8"));
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    await db.query(`DELETE FROM public.schema_fields WHERE key LIKE 'w2b_%'`);
    await db.query(`DELETE FROM public.test_provider_logos WHERE test_type LIKE 'W2B-%'`);
    await db.query(`DELETE FROM public.business_categories WHERE slug = $1`, [BIZ_SLUG]);
    await db.query(`DELETE FROM public.service_categories WHERE slug = ANY($1::text[])`, [[SVC_SLUG, SVC_DUP_SLUG]]);
    await db.query(`DELETE FROM public.cities WHERE country_id IN (SELECT id FROM public.countries WHERE iso2 = 'XK')`);
    await db.query(`DELETE FROM public.countries WHERE iso2 = 'XK'`);
    await db.query(`DROP SCHEMA IF EXISTS v1_staging CASCADE`);
    await db.query(`DROP SCHEMA IF EXISTS mig CASCADE`);
    await db.end().catch(() => {});
  }, 120_000);

  beforeEach(async () => {
    await db.query(`
      TRUNCATE v1_staging.countries, v1_staging.cities, v1_staging.business_categories,
               v1_staging.service_categories, v1_staging.test_provider_logos,
               v1_staging.business_category_default_services, v1_staging.fee_types,
               v1_staging.accreditations, v1_staging.degree_levels, v1_staging.areas_of_study,
               v1_staging.issuing_organizations
      RESTART IDENTITY CASCADE`);
    await db.query(`DELETE FROM public.schema_fields WHERE key LIKE 'w2b_%'`);
    await db.query(`DELETE FROM public.test_provider_logos WHERE test_type LIKE 'W2B-%'`);
    await db.query(`DELETE FROM public.cities WHERE country_id IN (SELECT id FROM public.countries WHERE iso2 = 'XK')`);
    await db.query(`DELETE FROM public.countries WHERE iso2 = 'XK'`);

    // Kosovo: the country the mledoze seeder does not carry, and one the seeder
    // does, so the run exercises both the import and the reconcile paths.
    await db.query(
      `INSERT INTO v1_staging.countries (id, name, slug, code, flag_emoji, continent, capital, currency,
                                         languages, timezone, about, is_active, created_at, updated_at)
       VALUES ($1, 'Kosovo', 'w2b-kosovo', 'XK', '🇽🇰', 'Europe', 'Pristina', 'EUR - Euro',
               ARRAY['Albanian','Serbian'], 'UTC+1', 'A V1 blurb', true, now(), now()),
              ($2, 'Australia', 'w2b-australia', 'AU', NULL, 'Oceania', NULL, NULL,
               NULL, NULL, NULL, true, now(), now())`,
      [C_KOSOVO, C_SEEDED],
    );
    await db.query(
      `INSERT INTO v1_staging.cities (id, country_id, name, slug, created_at, updated_at, status)
       VALUES (gen_random_uuid(), $1, 'Pristina', 'w2b-pristina', now(), now(), 'active')`,
      [C_KOSOVO],
    );

    await db.query(
      `INSERT INTO v1_staging.business_categories (id, slug, name, schema_fields, is_active, sort_order, created_at)
       VALUES ($1, $2, 'W2B Education Agency',
               '[{"key":"w2b_marn_number","type":"text","label":"MARN Number","required":false,"filterable":false}]'::jsonb,
               true, 1, now())`,
      [BIZ_CAT, BIZ_SLUG],
    );
    // Three definitions: a select with options, a `multi-select` V3 spells with
    // an underscore, and a number carrying a `step` V3 has no column for.
    await db.query(
      `INSERT INTO v1_staging.service_categories (id, slug, name, schema_fields, is_active, sort_order, created_at)
       VALUES ($1, $2, 'W2B Courses',
               '[{"key":"w2b_degree_level","type":"select","label":"Degree Level","required":true,"filterable":true,"options":["bachelor","master"]},
                 {"key":"w2b_study_mode","type":"multi-select","label":"Study Mode","filterable":true,"options":["On Campus","Online"]},
                 {"key":"w2b_distance_km","type":"number","label":"Distance (km)","step":0.1}]'::jsonb,
               true, 1, now())`,
      [SVC_CAT, SVC_SLUG],
    );
    // One key, defined twice: the case ON CONFLICT DO UPDATE cannot survive.
    await db.query(
      `INSERT INTO v1_staging.service_categories (id, slug, name, schema_fields, is_active, sort_order, created_at)
       VALUES ($1, $2, 'W2B Repeats',
               '[{"key":"w2b_repeated","type":"text","label":"First definition"},
                 {"key":"w2b_repeated","type":"text","label":"Second definition"}]'::jsonb,
               true, 2, now())`,
      [SVC_CAT_DUP, SVC_DUP_SLUG],
    );

    await db.query(
      `INSERT INTO v1_staging.test_provider_logos (id, test_type, category, logo_url, sort_order, created_at)
       VALUES ($1, 'W2B-IELTS', 'language', $3, 1, now()),
              ($2, 'W2B-JUNK',  'nonsense', $3, 2, now())`,
      [LOGO_OK, LOGO_BAD, LOGO_URL],
    );
  }, 60_000);

  // ── decision 3: the four owner-approved country imports ──────────────────────

  it("imports Kosovo under its owner-assigned ISO-3, and says XKX is not official", async () => {
    const before = Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.countries`)).rows[0].n);
    const report = await runTransform("w1-geo.ts", true);
    const after = Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.countries`)).rows[0].n);

    expect(after - before, "exactly the one country the seeder lacks — Australia is matched, not duplicated").toBe(1);
    expect(report.written["public.countries (imported)"]).toBe(1);

    const { rows } = await db.query<{ iso3: string; name: string; region: string | null; capital: string | null; about: string | null }>(
      `SELECT iso3, name, region, capital, about FROM public.countries WHERE iso2 = 'XK'`,
    );
    expect(rows[0].iso3, "the ISO-3 is the owner's, not something the transform derived").toBe("XKX");
    expect(rows[0].name, "the name comes from V1 verbatim — the migration takes no naming position").toBe("Kosovo");
    expect(rows[0].capital, "V1 is the only source there is for a country the seeder never had").toBe("Pristina");
    expect(rows[0].region, "V1's continent is copied only where the two vocabularies already agree").toBe("Europe");
    expect(rows[0].about).toBe("A V1 blurb");

    expect(
      report.notes.some((n) => n.includes("XKX") && n.includes("NOT an ISO 3166-1")),
      "a user-assigned code that silently looks official is exactly what must be said on every run",
    ).toBe(true);
  }, 120_000);

  it("loads the cities the import unblocks, and stops reporting them as unresolved", async () => {
    await runTransform("w1-geo.ts", true);

    const { rows } = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM public.cities c JOIN public.countries co ON co.id = c.country_id WHERE co.iso2 = 'XK'`,
    );
    expect(Number(rows[0].n), "a city whose country now resolves has somewhere to go").toBe(1);

    const { rows: unresolved } = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM mig.unresolved WHERE reason_code = 'unresolved_country'`,
    );
    expect(Number(unresolved[0].n)).toBe(0);
  }, 120_000);

  it("a second apply imports nothing and changes nothing", async () => {
    await runTransform("w1-geo.ts", true);
    const second = await runTransform("w1-geo.ts", true);
    expect(second.written["public.countries (imported)"], "the UNIQUE guard, not ON CONFLICT, is what makes this a no-op").toBe(0);
    const { rows } = await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.countries WHERE iso2 = 'XK'`);
    expect(Number(rows[0].n)).toBe(1);
  }, 180_000);

  // ── decision 1: schema_fields from the category jsonb ────────────────────────

  it("expands the category jsonb into schema_fields with the owning category as entity_id", async () => {
    const report = await runTransform("w2-reference.ts", true);
    expect(report.written["public.schema_fields (business_categories)"]).toBe(1);
    expect(report.written["public.schema_fields (service_categories)"]).toBe(4); // 3 + 1 of the repeated pair

    const { rows: biz } = await db.query<{ entity_id: number; entity_type: string; label: string; is_required: boolean; is_default: boolean }>(
      `SELECT f.entity_id, f.entity_type, f.label, f.is_required, f.is_default
         FROM public.schema_fields f
         JOIN public.business_categories c ON c.id = f.entity_id
        WHERE f.key = 'w2b_marn_number' AND f.entity_type = 'business_categories' AND c.slug = $1`,
      [BIZ_SLUG],
    );
    expect(biz, "the category row IS the entity — that is why these migrate and core_field_settings does not").toHaveLength(1);
    expect(biz[0].label).toBe("MARN Number");
    expect(biz[0].is_required).toBe(false);
    expect(biz[0].is_default, "a category-scoped field is not a platform default").toBe(false);

    const { rows: svc } = await db.query<{ key: string; type: string; filterable: boolean; options: unknown }>(
      `SELECT f.key, f.type, f.filterable, f.options
         FROM public.schema_fields f
         JOIN public.service_categories c ON c.id = f.entity_id
        WHERE f.entity_type = 'service_categories' AND c.slug = $1 ORDER BY f.key`,
      [SVC_SLUG],
    );
    expect(svc.map((r) => r.key)).toEqual(["w2b_degree_level", "w2b_distance_km", "w2b_study_mode"]);
    expect(svc.find((r) => r.key === "w2b_study_mode")!.type, "V1 writes `multi-select`; V3 spells it with an underscore").toBe("multi_select");
    expect(svc.find((r) => r.key === "w2b_degree_level")!.options).toEqual(["bachelor", "master"]);
    expect(svc.find((r) => r.key === "w2b_distance_km")!.options, "a number field has no choice list, and `step` is not one").toBeNull();
  }, 120_000);

  it("reports a jsonb key V3 has no column for instead of folding it into options", async () => {
    await runTransform("w2-reference.ts", true);
    const { rows } = await db.query<{ source_key: string; detail: string; column_name: string }>(
      `SELECT source_key, detail, column_name FROM mig.unresolved WHERE reason_code = 'no_v3_column'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source_key, "the key is suffixed with #<jsonb key> so it can never be mistaken for a row identity").toBe(
      `${SVC_SLUG}|w2b_distance_km#step`,
    );
    expect(rows[0].detail).toContain("no column for \"step\"");
  }, 120_000);

  it("reports a repeated field key rather than upserting the same row twice in one statement", async () => {
    await runTransform("w2-reference.ts", true);

    const { rows: loaded } = await db.query<{ label: string }>(
      `SELECT f.label FROM public.schema_fields f
         JOIN public.service_categories c ON c.id = f.entity_id
        WHERE c.slug = $1 AND f.key = 'w2b_repeated'`,
      [SVC_DUP_SLUG],
    );
    expect(loaded, "one row, not a crash and not two").toHaveLength(1);
    expect(loaded[0].label, "the first definition in the array wins, deterministically").toBe("First definition");

    const { rows: reported } = await db.query<{ source_key: string }>(
      `SELECT source_key FROM mig.unresolved
        WHERE reason_code = 'duplicate_natural_key' AND source_table = 'service_categories'`,
    );
    expect(reported.map((r) => r.source_key)).toEqual([`${SVC_DUP_SLUG}|w2b_repeated`]);
  }, 120_000);

  it("converges on a second apply instead of duplicating the expanded fields", async () => {
    await runTransform("w2-reference.ts", true);
    const first = Number(
      (await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.schema_fields WHERE key LIKE 'w2b_%'`)).rows[0].n,
    );
    await runTransform("w2-reference.ts", true);
    const second = Number(
      (await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.schema_fields WHERE key LIKE 'w2b_%'`)).rows[0].n,
    );
    expect(second).toBe(first);
    expect(first).toBe(5);
  }, 180_000);

  // ── decision 4: test_provider_logos ──────────────────────────────────────────

  it("loads the test-provider logos with the supabase URL carried verbatim for W6", async () => {
    const report = await runTransform("w2-reference.ts", true);
    expect(report.written["public.test_provider_logos"]).toBe(1);

    const { rows } = await db.query<{ v1_id: string; category: string; logo_url: string; sort_order: number }>(
      `SELECT v1_id, category, logo_url, sort_order FROM public.test_provider_logos WHERE test_type = 'W2B-IELTS'`,
    );
    expect(rows[0].v1_id, "the V1 uuid is preserved in v1_id, never in the serial PK").toBe(LOGO_OK);
    expect(rows[0].category).toBe("language");
    expect(rows[0].logo_url, "W6 rewrites this; the transform must not touch it").toBe(LOGO_URL);
    expect(rows[0].sort_order).toBe(1);
  }, 120_000);

  it("reason-codes a category V3's CHECK would reject rather than aborting the wave", async () => {
    await runTransform("w2-reference.ts", true);
    const { rows } = await db.query<{ source_key: string; detail: string }>(
      `SELECT source_key, detail FROM mig.unresolved
        WHERE source_table = 'test_provider_logos' AND reason_code = 'invalid_source_data'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source_key).toBe("W2B-JUNK");
    expect(rows[0].detail).toContain("language | academic");

    const { rows: absent } = await db.query<{ n: string }>(
      `SELECT count(*) AS n FROM public.test_provider_logos WHERE test_type = 'W2B-JUNK'`,
    );
    expect(Number(absent[0].n), "reported, and therefore not written — not written, and therefore reported").toBe(0);
  }, 120_000);

  // ── the rehearsal property, for the statements this wave added ───────────────

  it("a dry run rehearses the new writes and leaves the database untouched", async () => {
    const count = async () =>
      Number(
        (
          await db.query<{ n: string }>(
            `SELECT (SELECT count(*) FROM public.schema_fields)
                  + (SELECT count(*) FROM public.test_provider_logos)
                  + (SELECT count(*) FROM public.countries) AS n`,
          )
        ).rows[0].n,
      );

    const before = await count();
    const dry = await runTransform("w2-reference.ts", false);
    const dryGeo = await runTransform("w1-geo.ts", false);
    expect(await count(), "a dry run that writes is not a rehearsal").toBe(before);

    const appliedGeo = await runTransform("w1-geo.ts", true);
    const applied = await runTransform("w2-reference.ts", true);
    expect(appliedGeo.written).toEqual(dryGeo.written);
    expect(applied.written).toEqual(dry.written);
  }, 180_000);
});
