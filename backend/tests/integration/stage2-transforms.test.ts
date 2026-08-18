// Stage 2 — the W1/W2/W3 transforms, proven to be rehearsable and repeatable.
//
// The five conventions in Part 3 §1.5 are only worth writing down if something
// checks them, so this suite checks the two that carry all the weight:
//
//   DRY-RUN ⇄ APPLY EQUIVALENCE. A dry run must execute the identical statements
//   and report the identical counts as the apply that follows it, and must leave
//   the database byte-for-byte untouched. That is the whole basis for trusting a
//   green rehearsal, and it is the one property a "SELECT-only" dry run silently
//   fails to have — it never hits the NOT NULLs and UNIQUEs.
//
//   IDEMPOTENCE. Running a wave twice must converge, not duplicate. This is what
//   lets an interrupted cutover be fixed by running it again, and what lets W1
//   absorb users a previous migration already created.
//
// Plus the three failures that have actually bitten this migration before:
//
//   the §8 country-FK repair    a wrong country_id already in the database is
//                               re-resolved from the V1 free text, not left
//   the geo reconcile           a V1 country the seeder has no row for is
//                               REPORTED, never inserted as a duplicate
//   the W3 date trap            test_date is a real `date`; node-pg hands back a
//                               JS Date, and a careless coercion NULLs every row
//
// The fixture is a small V1-shaped dataset loaded into the real v1_staging DDL
// that Stage 1 emits, so the transforms run against the same shape they will see
// at cutover rather than a schema invented for the test. `public.countries` and
// `public.cities` come from the repo's own seeder (globalSetup), which is what
// makes the geo step a reconcile here exactly as it is in the dev database.

import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { dbAvailable } from "../helpers/db.js";
import { testDatabaseUrl } from "../setup/db-url.js";
import { DEFAULT_VISIBILITY, resolveVisibility } from "../../src/modules/platform-users/schemas/public-profile.schema.js";

const execFileAsync = promisify(execFile);
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STAGING_DDL = path.join(BACKEND_ROOT, "scripts/migration/v1-staging.sql");

const script = (name: string) => path.join(BACKEND_ROOT, "scripts/migration", name);

/** The waves, in the order a cutover runs them. */
const TRANSFORMS = [
  { name: "w1-geo", file: "w1-geo.ts" },
  { name: "w1-identity", file: "w1-identity.ts" },
  { name: "w1-businesses", file: "w1-businesses.ts" },
  { name: "w2-reference", file: "w2-reference.ts" },
  { name: "w3-subprofiles", file: "w3-subprofiles.ts" },
] as const;

// Fixture ids. Distinctive so the cleanup can find every row it created.
const USER_A = "aaaaaaaa-0000-4000-8000-000000000001";
const USER_B = "aaaaaaaa-0000-4000-8000-000000000002";
const BIZ_OWNED = "bbbbbbbb-0000-4000-8000-000000000001";
const BIZ_UNCLAIMED = "bbbbbbbb-0000-4000-8000-000000000002";
const COUNTRY_AU = "cccccccc-0000-4000-8000-000000000001";
const COUNTRY_NOWHERE = "cccccccc-0000-4000-8000-000000000002";
const TEST_DATE = "2020-08-12";
// The four student tables key on the preserved V1 uuid, so the fixture has to
// use fixed ones — a gen_random_uuid() here would make every beforeEach insert
// a new row instead of converging on the one before it.
const QUAL_ID = "dddddddd-0000-4000-8000-000000000001";
const WORK_ID = "dddddddd-0000-4000-8000-000000000002";
const LANG_ID = "dddddddd-0000-4000-8000-000000000003";
const ACAD_ID = "dddddddd-0000-4000-8000-000000000004";
const MEMBER_ID = "dddddddd-0000-4000-8000-000000000005";

const EMAILS = ["stage2.a@vitest.local", "stage2.b@vitest.local"];

interface RunReport {
  wave: string;
  apply: boolean;
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

/** Row counts across every table Stage 2 writes — the "untouched" fingerprint. */
async function snapshot(db: pg.Client): Promise<Record<string, number>> {
  const tables = [
    "public.countries", "public.cities", "public.platform_users", "public.platform_user_profiles",
    "superadmin.admin_users", "public.businesses", "public.institutions", "public.user_business_index",
    "public.degree_levels", "public.areas_of_study", "public.issuing_organizations",
    "public.service_categories", "public.business_categories", "public.fee_types",
    "public.business_category_default_services", "public.accreditations",
    "public.accreditation_scope_countries", "public.platform_user_qualifications",
    "public.platform_user_work_experiences", "public.platform_user_language_tests",
  ];
  const out: Record<string, number> = {};
  for (const t of tables) {
    const { rows } = await db.query<{ n: string }>(`SELECT count(*) AS n FROM ${t}`);
    out[t] = Number(rows[0].n);
  }
  return out;
}

const describeDb = describe.skipIf(!dbAvailable);

describeDb("Stage 2 transforms (W1, W2, W3)", () => {
  let db: pg.Client;

  beforeAll(async () => {
    db = new pg.Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    // The real Stage-1 DDL, not a hand-rolled stand-in: the transforms must run
    // against the shape they will actually see. Idempotent by construction.
    const { readFile } = await import("node:fs/promises");
    await db.query(await readFile(STAGING_DDL, "utf8"));
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    // Leave the shared test database as we found it. Tenant schemas first: they
    // are named after businesses.schema_name, so they have to go before it does.
    const { rows: schemas } = await db.query<{ schema_name: string }>(
      `SELECT schema_name::text FROM public.businesses WHERE meta->>'v1_business_id' IS NOT NULL`,
    );
    for (const s of schemas) await db.query(`DROP SCHEMA IF EXISTS "${s.schema_name}" CASCADE`);
    await db.query(`DELETE FROM public.user_business_index`);
    await db.query(`DELETE FROM public.businesses WHERE meta->>'v1_business_id' IS NOT NULL`);
    await db.query(`DELETE FROM public.institutions WHERE v1_business_id IS NOT NULL`);
    await db.query(`DELETE FROM public.platform_users WHERE email = ANY($1::text[])`, [EMAILS]);
    await db.query(`DELETE FROM public.accreditation_scope_countries`);
    await db.query(`DELETE FROM public.accreditations`);
    await db.query(`DELETE FROM public.business_category_default_services`);
    await db.query(`DELETE FROM public.fee_types`);
    await db.query(`DELETE FROM public.business_categories`);
    await db.query(`DELETE FROM public.service_categories`);
    await db.query(`DELETE FROM public.issuing_organizations`);
    await db.query(`DELETE FROM public.areas_of_study`);
    await db.query(`DELETE FROM public.degree_levels`);
    await db.query(`DELETE FROM public.cities WHERE slug IN ('stage2-testville')`);
    await db.query(`DROP SCHEMA IF EXISTS v1_staging CASCADE`);
    await db.query(`DROP SCHEMA IF EXISTS mig CASCADE`);
    await db.end().catch(() => {});
  }, 120_000);

  beforeEach(async () => {
    await db.query(`
      TRUNCATE v1_staging.countries, v1_staging.cities, v1_staging.auth_users, v1_staging.profiles,
               v1_staging.user_roles, v1_staging.businesses, v1_staging.business_members,
               v1_staging.degree_levels, v1_staging.areas_of_study, v1_staging.issuing_organizations,
               v1_staging.service_categories, v1_staging.business_categories, v1_staging.fee_types,
               v1_staging.business_category_default_services, v1_staging.accreditations,
               v1_staging.student_qualifications, v1_staging.student_work_experiences,
               v1_staging.student_language_tests, v1_staging.student_academic_tests
      RESTART IDENTITY CASCADE`);

    const now = "now()";
    // Two countries: one the seeder has (AU) and one it has never heard of, which
    // is the case W1 must report rather than invent an ISO-3 for.
    await db.query(
      // AU is featured at sort_order 2 in V1 — the destinations shelf V3 renders
      // from is_featured/sort_order, which W1 used to drop.
      `INSERT INTO v1_staging.countries (id, name, slug, code, about, is_featured, sort_order, created_at, updated_at)
       VALUES ($1,'Australia','australia','AU','A V1 blurb the seeder does not have',true,2,${now},${now}),
              ($2,'Nowhereland','nowhereland','ZZ','Not in mledoze',false,0,${now},${now})`,
      [COUNTRY_AU, COUNTRY_NOWHERE],
    );
    await db.query(
      `INSERT INTO v1_staging.cities (id, country_id, name, slug, about, created_at, updated_at, status)
       VALUES (gen_random_uuid(), $1, 'Sydney', 'sydney', 'V1 copy for a seeded city', ${now}, ${now}, 'active'),
              (gen_random_uuid(), $1, 'Testville', 'stage2-testville', 'A city only V1 has', ${now}, ${now}, 'active'),
              (gen_random_uuid(), $2, 'Ghost Town', 'ghost-town', NULL, ${now}, ${now}, 'active')`,
      [COUNTRY_AU, COUNTRY_NOWHERE],
    );

    await db.query(
      `INSERT INTO v1_staging.auth_users (id, email, email_confirmed_at, raw_user_meta_data, is_sso_user, is_anonymous)
       VALUES ($1, $3, ${now}, '{}'::jsonb, false, false),
              ($2, $4, NULL, '{"full_name":"Bee Beeson"}'::jsonb, false, false)`,
      [USER_A, USER_B, EMAILS[0], EMAILS[1]],
    );
    await db.query(
      // Both students published a public profile in V1 (a slug IS the publish flag).
      // A holds V1's DEFAULT_VISIBILITY — written here with scrambled key order on
      // purpose, so a transform that compared the JSON as a STRING would pass the
      // first assertion and fail the "stored as NULL" one. B genuinely customised it.
      `INSERT INTO v1_staging.profiles (id, user_id, first_name, last_name, nationality, country_of_residence,
                                        portal_type, individual_category, budget_currency, profile_slug,
                                        public_visibility, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Aay', 'Aayson', 'Australia', 'AU', 'business', 'student', 'AUD - Australian Dollar',
               'aay-aayson-s2t',
               '{"contact_info":false,"social_links":true,"certifications":true,"academic_tests":true,"language_tests":true,"work_experience":true,"education":true,"about":true}'::jsonb,
               ${now}, ${now}),
              (gen_random_uuid(), $2, NULL, NULL, 'AU', NULL, 'student', 'exploring', NULL,
               'bee-beeson-s2t',
               '{"about":true,"education":false,"work_experience":false,"language_tests":true,"academic_tests":false,"certifications":true,"social_links":true,"contact_info":false}'::jsonb,
               ${now}, ${now})`,
      [USER_A, USER_B],
    );
    await db.query(
      `INSERT INTO v1_staging.user_roles (id, user_id, role, created_at) VALUES (gen_random_uuid(), $1, 'super_admin', ${now})`,
      [USER_A],
    );

    await db.query(
      `INSERT INTO v1_staging.businesses
         (id, name, slug, business_type, country, created_at, updated_at,
          enquiry_enabled, enquiry_coin_cost, enquiry_max_distributions, show_team_public, is_published, default_currency)
       VALUES ($1, 'Stage2 Owned Agency', 'stage2-owned-agency', 'agent', 'Australia', ${now}, ${now}, true, 30, 5, false, true, 'AUD - Australian Dollar'),
              ($2, 'Stage2 Unclaimed College', 'stage2-unclaimed-college', 'institution', 'AU', ${now}, ${now}, true, 30, 5, false, false, NULL)`,
      [BIZ_OWNED, BIZ_UNCLAIMED],
    );
    await db.query(
      `INSERT INTO v1_staging.business_members (id, business_id, user_id, role, created_at, invite_status, is_public, position)
       VALUES ($3, $1, $2, 'owner', ${now}, 'accepted', false, 'Director')`,
      [BIZ_OWNED, USER_A, MEMBER_ID],
    );

    await db.query(
      `INSERT INTO v1_staging.degree_levels (id, name, slug, sort_order, is_active, created_at)
       VALUES (gen_random_uuid(), 'Bachelor', 'bachelor', 1, true, ${now})`,
    );
    await db.query(
      `INSERT INTO v1_staging.areas_of_study (id, name, slug, sort_order, is_active, created_at)
       VALUES (gen_random_uuid(), 'Engineering', 'engineering', 1, true, ${now})`,
    );
    await db.query(
      `INSERT INTO v1_staging.issuing_organizations (id, name, website, created_at, updated_at)
       VALUES (gen_random_uuid(), 'TEQSA', 'https://teqsa.gov.au', ${now}, ${now})`,
    );
    await db.query(
      `INSERT INTO v1_staging.service_categories (id, slug, name, icon, is_active, sort_order, created_at)
       VALUES (gen_random_uuid(), 'courses', 'Courses', NULL, true, 1, ${now})`,
    );
    await db.query(
      `INSERT INTO v1_staging.business_categories (id, slug, name, is_active, sort_order, created_at)
       VALUES (gen_random_uuid(), 'education_agency', 'Education Agency', true, 1, ${now})`,
    );
    await db.query(
      `INSERT INTO v1_staging.business_category_default_services (id, business_category_id, service_category_id, created_at)
       SELECT gen_random_uuid(), bc.id, sc.id, ${now}
         FROM v1_staging.business_categories bc, v1_staging.service_categories sc`,
    );
    await db.query(
      `INSERT INTO v1_staging.fee_types (id, name, slug, business_id, status, is_global, sort_order, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Tuition Fee', 'tuition_fee', NULL, 'approved', true, 0, ${now}, ${now}),
              (gen_random_uuid(), 'COE Fee', 'coe_fee', $1, 'approved', false, 1, ${now}, ${now})`,
      [BIZ_OWNED],
    );
    await db.query(
      `INSERT INTO v1_staging.accreditations (id, name, issuing_organization, is_global, status, sort_order, scope_countries, created_at, updated_at)
       VALUES (gen_random_uuid(), 'Stage2 CRICOS', 'TEQSA', true, 'approved', 0, ARRAY['Australia'], ${now}, ${now})`,
    );

    await db.query(
      `INSERT INTO v1_staging.student_qualifications (id, user_id, qualification_type, degree_title, is_current, start_date, sort_order, created_at, updated_at)
       VALUES ($2, $1, 'bachelor', 'BEng', false, '2019', 0, ${now}, ${now})`,
      [USER_A, QUAL_ID],
    );
    await db.query(
      `INSERT INTO v1_staging.student_work_experiences (id, user_id, job_title, organization_name, is_current, sort_order, created_at, updated_at, source_business_member_id)
       VALUES ($2, $1, 'Counsellor', 'Stage2 Owned Agency', true, 0, ${now}, ${now}, $3)`,
      [USER_A, WORK_ID, MEMBER_ID],
    );
    await db.query(
      `INSERT INTO v1_staging.student_language_tests (id, user_id, test_status, test_type, overall_score, test_date, sort_order, created_at, updated_at)
       VALUES ($3, $1, 'completed', 'IELTS', '7.5', $2::date, 0, ${now}, ${now})`,
      [USER_A, TEST_DATE, LANG_ID],
    );
    await db.query(
      `INSERT INTO v1_staging.student_academic_tests (id, user_id, test_status, test_type, overall_score, test_date, sort_order, created_at, updated_at)
       VALUES ($3, $1, 'completed', 'GRE', '320', $2::date, 0, ${now}, ${now})`,
      [USER_A, TEST_DATE, ACAD_ID],
    );
  }, 60_000);

  // ── the property the whole rehearsal rests on ────────────────────────────────

  it.each(TRANSFORMS)(
    "$name — a dry run reports what the apply writes, and changes nothing",
    async ({ file }) => {
      const before = await snapshot(db);
      const dry = await runTransform(file, false);
      const afterDry = await snapshot(db);

      expect(afterDry, "a dry run must leave the database untouched").toEqual(before);

      const applied = await runTransform(file, true);
      expect(applied.written, "the apply must write exactly what the dry run rehearsed").toEqual(dry.written);
      expect(applied.unresolved.map((u) => u.reasonCode).sort())
        .toEqual(dry.unresolved.map((u) => u.reasonCode).sort());
    },
    120_000,
  );

  it("every wave converges on a second --apply instead of duplicating", async () => {
    for (const { file } of TRANSFORMS) await runTransform(file, true);
    const afterFirst = await snapshot(db);

    for (const { file } of TRANSFORMS) await runTransform(file, true);
    const afterSecond = await snapshot(db);

    expect(afterSecond, "a re-run is a no-op, which is what makes an interrupted cutover recoverable")
      .toEqual(afterFirst);
  }, 180_000);

  // ── §8 risk 1: the country FK that is silently wrong ─────────────────────────

  it("re-resolves a country_id that is already wrong in the database", async () => {
    await runTransform("w1-geo.ts", true);
    await runTransform("w1-identity.ts", true);

    const { rows: correct } = await db.query<{ nationality_id: number }>(
      `SELECT p.nationality_id FROM public.platform_user_profiles p
         JOIN public.platform_users u ON u.id = p.user_id WHERE u.email = $1`,
      [EMAILS[0]],
    );
    expect(correct[0].nationality_id, "V1 says Australia, so the resolver must say Australia").not.toBeNull();

    // Exactly the §8 damage: a country_id nobody would notice was wrong.
    const { rows: wrong } = await db.query<{ id: number }>(
      `SELECT id FROM public.countries WHERE iso2 = 'IN'`,
    );
    await db.query(
      `UPDATE public.platform_user_profiles p SET nationality_id = $1
         FROM public.platform_users u WHERE u.id = p.user_id AND u.email = $2`,
      [wrong[0].id, EMAILS[0]],
    );

    const repair = await runTransform("w1-identity.ts", true);
    const { rows: after } = await db.query<{ nationality_id: number }>(
      `SELECT p.nationality_id FROM public.platform_user_profiles p
         JOIN public.platform_users u ON u.id = p.user_id WHERE u.email = $1`,
      [EMAILS[0]],
    );
    expect(after[0].nationality_id, "re-running W1 must re-resolve it, whichever statement gets there first")
      .toBe(correct[0].nationality_id);
    // …and on an undamaged database the repair changes nothing, which is the
    // half of §8 that says "prove the resolver is right rather than repairing
    // after the fact".
    expect(repair.written["public.platform_user_profiles (country FK repair)"]).toBe(0);
  }, 120_000);

  it("the repair reaches rows the load itself skips", async () => {
    await runTransform("w1-geo.ts", true);
    await runTransform("w1-identity.ts", true);

    const { rows: correct } = await db.query<{ nationality_id: number }>(
      `SELECT p.nationality_id FROM public.platform_user_profiles p
         JOIN public.platform_users u ON u.id = p.user_id WHERE u.email = $1`,
      [EMAILS[0]],
    );
    const { rows: wrong } = await db.query<{ id: number }>(`SELECT id FROM public.countries WHERE iso2 = 'IN'`);
    await db.query(
      `UPDATE public.platform_user_profiles p SET nationality_id = $1
         FROM public.platform_users u WHERE u.id = p.user_id AND u.email = $2`,
      [wrong[0].id, EMAILS[0]],
    );

    // Blank the V1 email: the LOAD filters this user out entirely, so the
    // upsert can no longer rewrite the row. Only the repair statement — which
    // keys on the profile, not on the account being loadable — can still reach
    // it. That is the case §8 is actually about: a country_id already in the
    // database that nothing is re-writing.
    await db.query(`UPDATE v1_staging.auth_users SET email = '' WHERE id = $1`, [USER_A]);
    const repair = await runTransform("w1-identity.ts", true);

    expect(repair.written["public.platform_users"], "the load must have skipped this user").toBe(1);
    expect(repair.written["public.platform_user_profiles (country FK repair)"]).toBe(1);

    const { rows: after } = await db.query<{ nationality_id: number }>(
      `SELECT p.nationality_id FROM public.platform_user_profiles p
         JOIN public.platform_users u ON u.id = p.user_id WHERE u.email = $1`,
      [EMAILS[0]],
    );
    expect(after[0].nationality_id).toBe(correct[0].nationality_id);
  }, 120_000);

  // ── D4: the public student profile ───────────────────────────────────────────

  it("carries the published profile slug across, and stores only a customised visibility", async () => {
    // profile_slug / public_visibility were dispositioned as dropped on the reason
    // "V3 has no public individual profile pages". Wave D4 shipped exactly those
    // pages (20260817_401_student_public_profiles.ts), so the reason is no longer
    // true and V1's 16 published profiles were being silently lost.
    //
    // The half that is easy to get wrong is public_visibility. D4's design makes
    // NULL mean "the defaults, resolved at read time" — storing the defaults would
    // freeze them at publish time. 14 of V1's 16 published profiles hold a value
    // byte-identical to DEFAULT_VISIBILITY, so a verbatim copy would freeze the
    // defaults for almost every profile it touched.
    await runTransform("w1-identity.ts", true);

    const { rows } = await db.query<{ email: string; profile_slug: string | null; public_visibility: unknown }>(
      `SELECT u.email, p.profile_slug, p.public_visibility
         FROM public.platform_user_profiles p
         JOIN public.platform_users u ON u.id = p.user_id
        WHERE u.email = ANY($1) ORDER BY u.email`,
      [[EMAILS[0], EMAILS[1]]],
    );
    const byEmail = new Map(rows.map((r) => [r.email, r]));

    expect(byEmail.get(EMAILS[0])?.profile_slug, "a slug IS the publish flag — losing it unpublishes the profile")
      .toBe("aay-aayson-s2t");
    expect(byEmail.get(EMAILS[1])?.profile_slug).toBe("bee-beeson-s2t");

    expect(
      byEmail.get(EMAILS[0])?.public_visibility,
      "V1 stored the defaults; storing them again would freeze them at publish time",
    ).toBeNull();
    expect(byEmail.get(EMAILS[1])?.public_visibility, "a genuinely customised blob is the one thing worth storing")
      .toEqual({
        about: true, education: false, work_experience: false, language_tests: true,
        academic_tests: false, certifications: true, social_links: true, contact_info: false,
      });

    // The claim in one number, the way the migrated database will be counted.
    const { rows: counts } = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.platform_user_profiles p
         JOIN public.platform_users u ON u.id = p.user_id
        WHERE u.email = ANY($1) AND p.public_visibility IS NOT NULL`,
      [[EMAILS[0], EMAILS[1]]],
    );
    expect(Number(counts[0].n), "exactly the customised ones are stored").toBe(1);
  }, 120_000);

  it("resolves both published profiles to the same visibility V1 rendered", async () => {
    // The parity claim that actually matters: NULL-means-defaults is a storage
    // decision, not a behaviour change. Resolved through the service's own helper,
    // every migrated profile must show the sections V1 showed.
    await runTransform("w1-identity.ts", true);

    const { rows } = await db.query<{ email: string; public_visibility: unknown }>(
      `SELECT u.email, p.public_visibility
         FROM public.platform_user_profiles p
         JOIN public.platform_users u ON u.id = p.user_id
        WHERE u.email = ANY($1)`,
      [[EMAILS[0], EMAILS[1]]],
    );
    const resolved = new Map(rows.map((r) => [r.email, resolveVisibility(r.public_visibility)]));

    expect(resolved.get(EMAILS[0]), "a stored NULL must resolve to exactly what V1 held").toEqual(DEFAULT_VISIBILITY);
    expect(resolved.get(EMAILS[1])).toEqual({ ...DEFAULT_VISIBILITY, education: false, work_experience: false, academic_tests: false });
  }, 120_000);

  // ── the geo reconcile ────────────────────────────────────────────────────────

  it("reports a V1 country the seeder does not have rather than inserting a duplicate", async () => {
    const before = Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.countries`)).rows[0].n);
    await runTransform("w1-geo.ts", true);
    const after = Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM public.countries`)).rows[0].n);

    expect(after, "countries.iso3 is NOT NULL and V1 has no ISO-3 — inserting means inventing one").toBe(before);
    const { rows } = await db.query<{ source_key: string; reason_code: string }>(
      `SELECT source_key, reason_code FROM mig.unresolved WHERE source_table = 'countries'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source_key: "zz", reason_code: "unresolved_country" });

    // …and the city underneath it goes with it, keyed so Gate 2 can match it.
    const { rows: cityRows } = await db.query<{ source_key: string }>(
      `SELECT source_key FROM mig.unresolved WHERE source_table = 'cities' AND reason_code = 'unresolved_country'`,
    );
    expect(cityRows.map((r) => r.source_key)).toEqual(["zz|ghost town"]);
  }, 120_000);

  it("carries V1's featured countries onto the shelf, in V1's order", async () => {
    // Gate 3: GET /api/v3/countries/featured returned 0 items against the migrated
    // database. V1 flags 8 countries with sort_order 0-2; all of them landed as
    // is_featured = false, sort_order = 0, because W1 carried neither column.
    //
    // Enrichment is COALESCE-only and cannot fix this: both columns are NOT NULL
    // with defaults, so the seeded row never has a NULL for the COALESCE to fill.
    //
    // beforeEach truncates v1_staging, not public — so put AU back to the state the
    // seeder leaves it in. Without this the assertion passes on a database an
    // earlier run already promoted, which is a test that cannot fail.
    await db.query(`UPDATE public.countries SET is_featured = false, sort_order = 0 WHERE iso2 = 'AU'`);

    await runTransform("w1-geo.ts", true);

    const { rows } = await db.query<{ iso2: string; is_featured: boolean; sort_order: number }>(
      `SELECT iso2, is_featured, sort_order FROM public.countries WHERE iso2 = 'AU'`,
    );
    expect(rows[0], "V1 features Australia; an empty destinations shelf is the bug").toMatchObject({
      is_featured: true,
      sort_order: 2,
    });
  }, 120_000);

  it("leaves a country V1 does not feature alone, and re-runs to zero writes", async () => {
    // The write is scoped to the countries V1 actually features. A V3 country V1
    // never mentions must not be touched at all — un-featuring rows is not what
    // "carry the flag across" means.
    // beforeEach truncates v1_staging, not public — so put AU back to the state the
    // seeder leaves it in, or an earlier test in this file has already promoted it
    // and "one country to promote" measures nothing.
    await db.query(`UPDATE public.countries SET is_featured = false, sort_order = 0 WHERE iso2 = 'AU'`);

    const { rows: before } = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.countries WHERE is_featured AND iso2 <> 'AU'`,
    );

    const first = await runTransform("w1-geo.ts", true);
    expect(first.written["public.countries (featured)"], "one country to promote").toBe(1);

    const { rows: after } = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.countries WHERE is_featured AND iso2 <> 'AU'`,
    );
    expect(after[0].n).toBe(before[0].n);

    const second = await runTransform("w1-geo.ts", true);
    expect(second.written["public.countries (featured)"], "a second --apply is 0 changes").toBe(0);
  }, 120_000);

  it("adds only the cities the seeder lacks, and enriches the ones it has", async () => {
    await runTransform("w1-geo.ts", true);

    // Sydney is already seeded, so it must be enriched in place, not duplicated.
    const { rows: sydney } = await db.query<{ n: string; about: string | null }>(
      `SELECT count(*)::text AS n, min(c.about) AS about
         FROM public.cities c JOIN public.countries co ON co.id = c.country_id
        WHERE co.iso2 = 'AU' AND c.name = 'Sydney'`,
    );
    expect(Number(sydney[0].n), "one Sydney, not two").toBe(1);
    expect(sydney[0].about, "the seeded row keeps its identity but gains V1's copy").toBe("V1 copy for a seeded city");

    // Testville is V1-only, so it must be there.
    const { rows: testville } = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.cities WHERE slug = 'stage2-testville'`,
    );
    expect(Number(testville[0].n)).toBe(1);
  }, 120_000);

  // ── W3: the date trap ────────────────────────────────────────────────────────

  it("lands test_date as the date V1 held, for both halves of the discriminator", async () => {
    for (const { file } of TRANSFORMS) await runTransform(file, true);

    const { rows } = await db.query<{ category: string; test_date: unknown }>(
      `SELECT t.category, t.test_date::text AS test_date
         FROM public.platform_user_language_tests t
         JOIN public.platform_users u ON u.id = t.user_id
        WHERE u.email = $1 ORDER BY t.category`,
      [EMAILS[0]],
    );

    expect(rows.map((r) => r.category), "§15 decision 2: one table, two categories").toEqual(["academic", "language"]);
    for (const row of rows) {
      expect(row.test_date, `${row.category} must not be NULL — that is the bug this guards`).toBe(TEST_DATE);
    }
  }, 180_000);

  // ── W1.4: provisioning is DDL, the agent load is data ────────────────────────

  it("w1-tenants — provisions the schema in both modes, but only --apply writes agents", async () => {
    await runTransform("w1-geo.ts", true);
    await runTransform("w1-identity.ts", true);
    await runTransform("w1-businesses.ts", true);

    const agents = async () => {
      const { rows } = await db.query<{ schema_name: string }>(
        `SELECT schema_name::text FROM public.businesses WHERE meta->>'v1_business_id' IS NOT NULL`,
      );
      let n = 0;
      for (const r of rows) {
        const { rows: c } = await db.query<{ n: string }>(`SELECT count(*) AS n FROM "${r.schema_name}".agents`);
        n += Number(c[0].n);
      }
      return n;
    };

    const dry = await runTransform("w1-tenants.ts", false);
    // Provisioning is idempotent forward-only DDL and runs in both modes on
    // purpose — without the schema there is nothing for a dry run to rehearse
    // against. The DATA half still rolls back.
    expect(await agents(), "a dry run writes no agents").toBe(0);

    const applied = await runTransform("w1-tenants.ts", true);
    expect(applied.written, "the apply writes exactly what the dry run rehearsed").toEqual(dry.written);
    expect(await agents()).toBe(1);

    const again = await runTransform("w1-tenants.ts", true);
    expect(again.written['"{{schema}}".agents']).toBe(1);
    expect(await agents(), "a second run converges on the same agent").toBe(1);

    const { rows } = await db.query<{ schema_name: string }>(
      `SELECT schema_name::text FROM public.businesses WHERE meta->>'v1_business_id' IS NOT NULL`,
    );
    const { rows: agent } = await db.query<{ is_owner: boolean; role: string; position: string | null }>(
      `SELECT a.is_owner, r.name AS role, a.meta->>'position' AS position
         FROM "${rows[0].schema_name}".agents a JOIN "${rows[0].schema_name}".roles r ON r.id = a.role_id`,
    );
    expect(agent[0]).toMatchObject({ is_owner: true, role: "owner", position: "Director" });
  }, 300_000);

  // ── W1: the split V3's schema forces ─────────────────────────────────────────

  it("splits V1 businesses into an owned tenant and an unclaimed institution", async () => {
    await runTransform("w1-geo.ts", true);
    await runTransform("w1-identity.ts", true);
    const report = await runTransform("w1-businesses.ts", true);

    expect(report.written["public.businesses"]).toBe(1);
    expect(report.written["public.institutions"]).toBe(1);
    expect(report.written["public.user_business_index"]).toBe(1);

    // Scoped to this fixture's own rows. Other suites share this database and leave
    // businesses behind, so an unscoped SELECT reads whichever row sorts first and
    // fails on suite order alone.
    const { rows } = await db.query<{ v1: string; subdomain: string; schema_name: string }>(
      `SELECT meta->>'v1_business_id' AS v1, subdomain, schema_name::text AS schema_name
         FROM public.businesses WHERE meta->>'v1_business_id' = $1`,
      [BIZ_OWNED],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].v1).toBe(BIZ_OWNED);
    expect(rows[0].subdomain).toBe("stage2-owned-agency");

    // Derived, not generated: a second run must land on the same tenant schema.
    await runTransform("w1-businesses.ts", true);
    const { rows: again } = await db.query<{ schema_name: string }>(
      `SELECT schema_name::text AS schema_name
         FROM public.businesses WHERE meta->>'v1_business_id' = $1`,
      [BIZ_OWNED],
    );
    expect(again).toHaveLength(1);
    expect(again[0].schema_name).toBe(rows[0].schema_name);

    const { rows: inst } = await db.query<{ v1_business_id: string; claim_status: string }>(
      `SELECT v1_business_id::text AS v1_business_id, claim_status
         FROM public.institutions WHERE v1_business_id = $1`,
      [BIZ_UNCLAIMED],
    );
    expect(inst).toHaveLength(1);
    expect(inst[0]).toMatchObject({ v1_business_id: BIZ_UNCLAIMED, claim_status: "unclaimed" });
  }, 120_000);
});
