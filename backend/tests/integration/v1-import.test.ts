// V1 -> V3 importers against real Postgres (plan M0 geography + FK backfill, M2
// student sub-profiles).
//
// A throwaway database plays the part of the V1 restore, so the scripts run
// exactly as they do in production: two connections, source pinned read-only,
// one transaction, --apply to commit.
//
// What this pins down:
//   * ISO-2 -> ISO-3 -> country row resolution, including the AU/HR/NP cases
//     the first recon could not resolve
//   * uuid -> serial remapping (V1 city.country_id uuid becomes countries.id int)
//   * a dry run touches nothing but hits the same constraints as --apply
//   * a second --apply inserts zero rows
//   * values that cannot be resolved are reported, never silently dropped
//   * the country FK backfill repairs a NULL written when V3 had 24 countries

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable } from "../helpers/db.js";
import { testDatabaseUrl } from "../setup/db-url.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Fixed uuids so assertions can name the row they mean.
const U = {
  australia: "11111111-1111-4111-8111-111111111111",
  croatia: "22222222-2222-4222-8222-222222222222",
  zimbabwe: "33333333-3333-4333-8333-333333333333",
  atlantis: "44444444-4444-4444-8444-444444444444",
  user: "55555555-5555-4555-8555-555555555555",
  qualification: "66666666-6666-4666-8666-666666666666",
  languageTest: "77777777-7777-4777-8777-777777777777",
  orphanTest: "88888888-8888-4888-8888-888888888888",
  business: "99999999-9999-4999-8999-999999999999",
};

const FIXTURE_SQL = `
CREATE TABLE public.countries (
  id uuid PRIMARY KEY, name text NOT NULL, code text, continent text,
  flag_emoji text, currency text, about text, hero_image_url text
);
CREATE TABLE public.cities (
  id uuid PRIMARY KEY, country_id uuid NOT NULL REFERENCES public.countries(id),
  name text NOT NULL, slug text, about text
);
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY, nationality text, country_of_residence text,
  personal_address_country text
);
CREATE TABLE public.businesses (id uuid PRIMARY KEY, name text NOT NULL, country text);
CREATE TABLE public.student_qualifications (
  id uuid PRIMARY KEY, user_id uuid NOT NULL, qualification_type text, degree_title text,
  subject_area text, institution_name text, grading_system text, grade_value text,
  is_current boolean NOT NULL DEFAULT false, start_date text, end_date text,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE public.student_work_experiences (
  id uuid PRIMARY KEY, user_id uuid NOT NULL, job_title text NOT NULL,
  organization_name text, is_current boolean NOT NULL DEFAULT false,
  start_date text, end_date text, sort_order integer NOT NULL DEFAULT 0,
  source_business_member_id uuid
);
CREATE TABLE public.student_language_tests (
  id uuid PRIMARY KEY, user_id uuid NOT NULL, test_status text NOT NULL DEFAULT 'completed',
  test_type text NOT NULL, overall_score text, test_date date, sub_scores jsonb DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE public.student_academic_tests (
  id uuid PRIMARY KEY, user_id uuid NOT NULL, test_status text NOT NULL DEFAULT 'completed',
  test_type text NOT NULL, overall_score text, test_date date, sub_scores jsonb DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0
);

INSERT INTO public.countries (id, name, code, continent, flag_emoji, currency, about) VALUES
  ('${U.australia}', 'Australia', 'AU', 'Oceania', '🇦🇺', 'AUD', 'CMS copy with no V3 column'),
  ('${U.croatia}',   'Croatia',   'HR', 'Europe',  '🇭🇷', 'EUR', NULL),
  ('${U.zimbabwe}',  'Zimbabwe',  'ZW', 'Africa',  '🇿🇼', 'ZWL', NULL),
  -- ZZ is not an ISO 3166-1 code: must be reported, never invented into iso3.
  ('${U.atlantis}',  'Atlantis',  'ZZ', 'Atlantic', NULL, NULL, NULL);

INSERT INTO public.cities (id, country_id, name, slug) VALUES
  (gen_random_uuid(), '${U.zimbabwe}', 'Harare', 'harare'),
  (gen_random_uuid(), '${U.zimbabwe}', 'Bulawayo', 'bulawayo'),
  -- Same name twice in the source: the importer, not a DB constraint, dedupes.
  (gen_random_uuid(), '${U.zimbabwe}', 'harare', 'harare-2'),
  (gen_random_uuid(), '${U.atlantis}', 'Poseidonis', 'poseidonis');

INSERT INTO public.profiles (user_id, nationality, country_of_residence, personal_address_country) VALUES
  ('${U.user}', 'Zimbabwe', 'HR', 'Atlantis');

INSERT INTO public.businesses (id, name, country) VALUES ('${U.business}', 'Harare Agents', 'Zimbabwe');

INSERT INTO public.student_qualifications (id, user_id, qualification_type, degree_title, start_date, end_date)
VALUES ('${U.qualification}', '${U.user}', 'bachelor', 'BSc', '01/2020', '12/2023');

INSERT INTO public.student_work_experiences (id, user_id, job_title, start_date)
VALUES (gen_random_uuid(), '${U.user}', 'Counsellor', '01/24');

INSERT INTO public.student_language_tests (id, user_id, test_type, overall_score, test_date, sub_scores)
VALUES ('${U.languageTest}', '${U.user}', 'IELTS', '7.5', DATE '2026-04-06', '{"reading": 8}'::jsonb);

-- A row whose owner was never migrated: reported, not loaded.
INSERT INTO public.student_language_tests (id, user_id, test_type, overall_score)
VALUES ('${U.orphanTest}', '${U.atlantis}', 'TOEFL', '100');

INSERT INTO public.student_academic_tests (id, user_id, test_type, overall_score)
VALUES (gen_random_uuid(), '${U.user}', 'GRE', '320');
`;

const describeDb = describe.skipIf(!dbAvailable);

describeDb("V1 -> V3 importers", () => {
  const v3Url = testDatabaseUrl();
  const fixtureName = `${new URL(v3Url).pathname.replace(/^\//, "")}_v1_fixture`;
  const fixtureUrl = new URL(v3Url);
  fixtureUrl.pathname = `/${fixtureName}`;

  let v3: pg.Client;
  let userId: number;

  /** Run an importer the way an operator would: a child process with both URLs. */
  function run(script: string, ...args: string[]): string {
    return execFileSync(process.execPath, [`database/scripts/${script}`, ...args], {
      cwd: backendRoot,
      env: {
        ...process.env,
        V1_DATABASE_URL: fixtureUrl.toString(),
        V3_DATABASE_URL: v3Url,
      },
      encoding: "utf8",
    });
  }

  const count = async (sql: string, params: unknown[] = []) => {
    const { rows } = await v3.query(`SELECT count(*)::int AS n FROM ${sql}`, params);
    return rows[0].n as number;
  };

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: v3Url });
    await admin.connect();
    // Terminate stragglers so a re-run is never blocked by a leaked connection.
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [fixtureName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${fixtureName}"`);
    await admin.query(`CREATE DATABASE "${fixtureName}"`);
    await admin.end();

    const fixture = new pg.Client({ connectionString: fixtureUrl.toString() });
    await fixture.connect();
    await fixture.query(FIXTURE_SQL);
    await fixture.end();

    v3 = new pg.Client({ connectionString: v3Url });
    await v3.connect();

    // These tests need Zimbabwe absent from V3 so the importer has something to
    // insert. Establish that explicitly rather than inheriting it from whatever
    // the seeder happens to load — it used to seed 24 countries and no longer
    // does, which silently turned "ZW is missing" into "ZW is present with 15
    // cities". Cities go first: they FK to countries, so deleting the country
    // alone fails.
    await v3.query(
      `DELETE FROM public.cities WHERE country_id IN (SELECT id FROM public.countries WHERE iso2 = 'ZW')`,
    );
    await v3.query(`DELETE FROM public.countries WHERE iso2 = 'ZW'`);

    // A user migrated before the full country set existed: the FK is NULL even
    // though V1 has a country for it. That is the bug the backfill repairs.
    await v3.query(`DELETE FROM public.platform_users WHERE uuid = $1`, [U.user]);
    const { rows } = await v3.query(
      `INSERT INTO public.platform_users (uuid, first_name, last_name, email, account_status)
       VALUES ($1, 'Test', 'Student', $2, 1) RETURNING id`,
      [U.user, `v1-import.${process.pid}@vitest.local`],
    );
    userId = rows[0].id;
    await v3.query(
      `INSERT INTO public.platform_user_profiles (user_id, nationality_id, country_of_residence_id)
       VALUES ($1, NULL, NULL)`,
      [userId],
    );
  });

  afterAll(async () => {
    if (v3) {
      await v3.query(`DELETE FROM public.platform_users WHERE uuid = $1`, [U.user]).catch(() => {});
      await v3.query(`DELETE FROM public.cities WHERE name IN ('Harare','Bulawayo')`).catch(() => {});
      await v3.query(`DELETE FROM public.countries WHERE iso2 = 'ZW'`).catch(() => {});
      await v3.end().catch(() => {});
    }
    const admin = new pg.Client({ connectionString: v3Url });
    await admin.connect();
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [fixtureName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${fixtureName}"`);
    await admin.end();
  });

  describe("import-v1-geo dry run", () => {
    it("writes nothing", async () => {
      const before = await count("public.countries");
      const output = run("import-v1-geo.mjs");

      expect(output).toContain("DRY RUN");
      expect(await count("public.countries")).toBe(before);
      expect(await count("public.countries WHERE iso2 = 'ZW'")).toBe(0);
    });

    it("still exercises the same insert path, so its counts match --apply", () => {
      // 3 of 4 fixture countries are loadable; Atlantis (ZZ) has no ISO-3.
      const output = run("import-v1-geo.mjs");
      expect(output).toMatch(/countries inserted:\s+1\b/); // only ZW is new
      expect(output).toMatch(/countries updated:\s+2\b/); // AU + HR are already curated
    });

    it("reports the code it cannot resolve instead of inventing an iso3", () => {
      const output = run("import-v1-geo.mjs");
      expect(output).toContain("UNRESOLVED iso3");
      expect(output).toContain("ZZ Atlantis");
      // And its cities go nowhere, loudly.
      expect(output).toContain("Poseidonis");
    });

    it("lists the V1 CMS fields that have no V3 column", () => {
      const output = run("import-v1-geo.mjs");
      expect(output).toContain("V1 country fields with no V3 column (dropped)");
      expect(output).toContain("about");
      expect(output).toContain("hero_image_url");
    });
  });

  describe("import-v1-geo --apply", () => {
    it("inserts the missing country and remaps city country_id from uuid to serial", async () => {
      run("import-v1-geo.mjs", "--apply");

      const { rows } = await v3.query(`SELECT id, name, iso3, region FROM public.countries WHERE iso2 = 'ZW'`);
      expect(rows).toHaveLength(1);
      expect(rows[0].iso3).toBe("ZWE");
      expect(rows[0].region).toBe("Africa");
      expect(typeof rows[0].id).toBe("number");

      const cities = await v3.query(
        `SELECT name FROM public.cities WHERE country_id = $1 ORDER BY name`,
        [rows[0].id],
      );
      // "harare" is a duplicate of "Harare" in the source and must not land twice.
      expect(cities.rows.map((r) => r.name.toLowerCase())).toEqual(["bulawayo", "harare"]);
    });

    it("keeps the curated V3 name and reports the divergence", async () => {
      const { rows } = await v3.query(`SELECT name FROM public.countries WHERE iso2 = 'AU'`);
      expect(rows[0].name).toBe("Australia");
    });

    it("inserts zero rows on a second --apply", async () => {
      const countriesBefore = await count("public.countries");
      const citiesBefore = await count("public.cities");

      const output = run("import-v1-geo.mjs", "--apply");

      expect(output).toMatch(/countries inserted:\s+0\b/);
      expect(output).toMatch(/cities inserted:\s+0\b/);
      expect(await count("public.countries")).toBe(countriesBefore);
      expect(await count("public.cities")).toBe(citiesBefore);
    });
  });

  describe("backfill-country-fks", () => {
    it("repairs the NULL that the 24-country resolver produced", async () => {
      const before = await v3.query(
        `SELECT nationality_id FROM public.platform_user_profiles WHERE user_id = $1`,
        [userId],
      );
      expect(before.rows[0].nationality_id).toBeNull();

      const output = run("backfill-country-fks.mjs", "--apply");
      expect(output).toContain("repaired (NULL -> id):  2"); // Zimbabwe + HR

      const after = await v3.query(
        `SELECT c.iso2 AS nationality, r.iso2 AS residence
           FROM public.platform_user_profiles p
           LEFT JOIN public.countries c ON c.id = p.nationality_id
           LEFT JOIN public.countries r ON r.id = p.country_of_residence_id
          WHERE p.user_id = $1`,
        [userId],
      );
      expect(after.rows[0].nationality).toBe("ZW");
      expect(after.rows[0].residence).toBe("HR"); // resolved by ISO-2, not name
    });

    it("reports the value it still cannot resolve rather than dropping it", () => {
      const output = run("backfill-country-fks.mjs");
      expect(output).toContain("STILL UNRESOLVED");
      expect(output).toContain("Atlantis");
    });

    it("changes nothing on a second run", () => {
      const output = run("backfill-country-fks.mjs", "--apply");
      expect(output).toContain("repaired (NULL -> id):  0");
      expect(output).toContain("corrected (wrong id):   0");
    });
  });

  describe("import-v1-student-subprofiles", () => {
    it("resolves user_id from uuid to serial and preserves the V1 row id", async () => {
      run("import-v1-student-subprofiles.mjs", "--apply");

      const { rows } = await v3.query(
        `SELECT id, user_id, degree_title, start_date FROM public.platform_user_qualifications WHERE user_id = $1`,
        [userId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(U.qualification);
      expect(rows[0].user_id).toBe(userId);
      // start_date is text on both sides — carried across verbatim, not reformatted.
      expect(rows[0].start_date).toBe("01/2020");
    });

    it("carries a real date column across intact", async () => {
      const { rows } = await v3.query(
        `SELECT to_char(test_date, 'YYYY-MM-DD') AS d, sub_scores FROM public.platform_user_language_tests WHERE id = $1`,
        [U.languageTest],
      );
      expect(rows[0].d).toBe("2026-04-06");
      expect(rows[0].sub_scores).toEqual({ reading: 8 });
    });

    it("reports rows whose user was never migrated instead of loading them", async () => {
      const output = run("import-v1-student-subprofiles.mjs");
      expect(output).toContain("rows whose user was never migrated");
      expect(output).toContain(U.orphanTest);
      expect(await count("public.platform_user_language_tests WHERE id = $1", [U.orphanTest])).toBe(0);
    });

    it("reports the ambiguous text date it refuses to reinterpret", () => {
      const output = run("import-v1-student-subprofiles.mjs");
      expect(output).toContain("non-ISO text dates");
      expect(output).toContain("01/24");
    });

    it("counts student_academic_tests without creating a table for them", async () => {
      const output = run("import-v1-student-subprofiles.mjs");
      expect(output).toContain("student_academic_tests: 1 rows NOT migrated");
      expect(output).toContain("GRE: 1");

      const { rows } = await v3.query(
        `SELECT to_regclass('public.platform_user_academic_tests') AS t,
                to_regclass('public.student_academic_tests') AS s`,
      );
      expect(rows[0].t).toBeNull();
      expect(rows[0].s).toBeNull();
    });

    it("inserts zero rows on a second --apply", async () => {
      const before = await count("public.platform_user_qualifications");
      const output = run("import-v1-student-subprofiles.mjs", "--apply");

      expect(output).toMatch(/student_qualifications\s+1\s+0\s+1/);
      expect(await count("public.platform_user_qualifications")).toBe(before);
    });
  });
});
