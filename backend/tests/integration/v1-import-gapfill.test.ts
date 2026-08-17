// The 24 columns that existed on BOTH sides but were never written by the
// importers — silent data loss the parity gate reported as "NOT MIGRATED".
//
// Same shape as v1-import.test.ts: a throwaway database plays the V1 restore, so
// import-v1-users.mjs and import-v1-businesses.ts run exactly as an operator runs
// them (two connections, source read-only, --apply to commit).
//
// What this pins down:
//   * businesses.is_published comes from V1's own publish flag, not from status
//   * business_category_id: V1 uuid -> V3 serial, bridged by the category slug
//   * profiles preferred_destinations: country NAMES -> jsonb array of country IDs
//   * preferred_fields text[] -> fields_of_study jsonb [{name}]
//   * budget_currency / default_currency label -> ISO-4217 code
//   * individual_category: V1 label -> V3 PERSONAL_SUB_CATEGORIES
//   * business_members.position -> tenant agents.meta->>'position'
//   * business_members.invited_by -> tenant agents.added_by (a self-FK)
//   * values that cannot be resolved are REPORTED, never silently dropped
//   * a second --apply changes nothing

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable } from "../helpers/db.js";
import { testDatabaseUrl } from "../setup/db-url.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const U = {
  owner: "aaaaaaaa-0000-4000-8000-000000000001",
  staff: "aaaaaaaa-0000-4000-8000-000000000002",
  student: "aaaaaaaa-0000-4000-8000-000000000003",
  stranger: "aaaaaaaa-0000-4000-8000-000000000004",
  bizPublished: "bbbbbbbb-0000-4000-8000-000000000001",
  bizDraft: "bbbbbbbb-0000-4000-8000-000000000002",
  catAgency: "cccccccc-0000-4000-8000-000000000001",
  catUnknown: "cccccccc-0000-4000-8000-000000000002",
};

const EMAIL = {
  owner: `gapfill.owner.${process.pid}@vitest.local`,
  staff: `gapfill.staff.${process.pid}@vitest.local`,
  student: `gapfill.student.${process.pid}@vitest.local`,
  stranger: `gapfill.stranger.${process.pid}@vitest.local`,
};

const FIXTURE_SQL = `
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb, deleted_at timestamptz
);
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY, first_name text, last_name text, phone text, avatar_url text,
  nationality text, country_of_residence text, personal_address_country text,
  date_of_birth date, gender text, highest_degree_level text, institution_attended text,
  gpa numeric(4,2), graduation_year integer, english_test_type text,
  english_test_score numeric(5,2), english_test_date date,
  budget_min integer, budget_max integer, completion_percentage integer DEFAULT 0,
  onboarding_completed boolean DEFAULT false, portal_type text DEFAULT 'student',
  personal_address_street text, personal_address_city text, personal_address_state text,
  personal_address_postcode text,
  budget_currency text, preferred_destinations text[], preferred_fields text[],
  preferred_degree_levels text[], expected_start_date text,
  include_living_expenses boolean DEFAULT false, individual_category text,
  linkedin_url text, website_url text,
  personal_address_lat double precision, personal_address_lng double precision
);
CREATE TABLE public.user_roles (user_id uuid PRIMARY KEY, role text NOT NULL);
CREATE TABLE public.business_categories (id uuid PRIMARY KEY, slug text NOT NULL, name text);
CREATE TABLE public.businesses (
  id uuid PRIMARY KEY, name text NOT NULL, slug text, business_type text NOT NULL,
  description text, logo_url text, cover_url text, website text, email text, phone text,
  country text, state text, city text, address text,
  linkedin_url text, facebook_url text, twitter_url text, instagram_url text,
  status text, verified_at timestamptz, is_suspended boolean DEFAULT false,
  is_published boolean NOT NULL DEFAULT false, business_category_id uuid,
  gallery_images text[] DEFAULT '{}'::text[], video_urls text[] DEFAULT '{}'::text[],
  registration_code text, registration_licenses jsonb DEFAULT '{}'::jsonb,
  postcode text, youtube_url text, whatsapp_url text, default_currency text
);
CREATE TABLE public.business_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL, user_id uuid, role text NOT NULL,
  invited_by uuid, invite_email text, joined_at timestamptz DEFAULT now(),
  invite_status text NOT NULL DEFAULT 'accepted', position text
);

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('${U.owner}',    '${EMAIL.owner}',    now()),
  ('${U.staff}',    '${EMAIL.staff}',    now()),
  ('${U.student}',  '${EMAIL.student}',  now()),
  ('${U.stranger}', '${EMAIL.stranger}', now());

INSERT INTO public.profiles (user_id, first_name, last_name, portal_type) VALUES
  ('${U.owner}', 'Owen', 'Owner', 'business'),
  ('${U.staff}', 'Stella', 'Staff', 'business'),
  ('${U.stranger}', 'Strange', 'Stranger', 'business');

-- The one profile that exercises every study-preference column at once.
-- "Atlantis" is not a country and "wanderer" is not a V3 sub-category: both must
-- be REPORTED, and the surrounding good values must still land.
INSERT INTO public.profiles (
  user_id, first_name, last_name, portal_type,
  budget_currency, preferred_destinations, preferred_fields, preferred_degree_levels,
  expected_start_date, include_living_expenses, individual_category,
  linkedin_url, website_url, personal_address_lat, personal_address_lng
) VALUES (
  '${U.student}', 'Stu', 'Dent', 'student',
  'AUD - Australian Dollar', ARRAY['Australia','Atlantis','Canada'],
  ARRAY['Computer Science & IT','Law'], ARRAY['bachelor','master'],
  '07-2026', true, 'wanderer',
  'https://linkedin.test/stu', 'https://stu.test',
  -37.8136123, 144.9630567
);

INSERT INTO public.business_categories (id, slug, name) VALUES
  ('${U.catAgency}',  'education_agency', 'Education Agency'),
  ('${U.catUnknown}', 'category_v3_never_loaded', 'Unknown');

-- Published in V1 while still 'pending': status must NOT be the publish signal.
INSERT INTO public.businesses (
  id, name, slug, business_type, country, status, is_published, business_category_id,
  gallery_images, video_urls, registration_code, registration_licenses,
  postcode, youtube_url, whatsapp_url, default_currency
) VALUES (
  '${U.bizPublished}', 'Gapfill Published Agency', 'gapfill-published-${process.pid}',
  'education_agent', 'Australia', 'pending', true, '${U.catAgency}',
  ARRAY['https://cdn.test/a.jpg','https://cdn.test/b.jpg'], ARRAY['https://vid.test/1'],
  'ABN-12345', '{"licenses": [{"type": "QEAC", "number": "999"}]}'::jsonb,
  '3000', 'https://youtube.test/c', 'https://wa.me/61400000000',
  'AUD - Australian Dollar'
);

-- Verified in V1 but NOT published: a verified listing must stay unpublished.
-- Its category uuid has no V3 counterpart, so the remap must report it.
INSERT INTO public.businesses (id, name, slug, business_type, country, status, is_published, business_category_id)
VALUES ('${U.bizDraft}', 'Gapfill Draft Agency', 'gapfill-draft-${process.pid}',
        'education_agent', 'Australia', 'verified', false, '${U.catUnknown}');

INSERT INTO public.business_members (business_id, user_id, role, invite_status, position, invited_by) VALUES
  ('${U.bizPublished}', '${U.owner}',    'owner', 'accepted', 'CEO and Founder', NULL),
  ('${U.bizPublished}', '${U.staff}',    'staff', 'accepted', 'Admission Officer', '${U.owner}'),
  ('${U.bizDraft}',     '${U.student}',  'owner', 'accepted', NULL, NULL),
  -- Invited by someone who is not a member of THIS business: added_by cannot be
  -- resolved inside the tenant schema, so it must be reported, not invented.
  ('${U.bizDraft}',     '${U.stranger}', 'admin', 'accepted', NULL, '${U.owner}');
`;

const describeDb = describe.skipIf(!dbAvailable);

describeDb("V1 -> V3 importers: the declared-gap columns", () => {
  const v3Url = testDatabaseUrl();
  const fixtureName = `${new URL(v3Url).pathname.replace(/^\//, "")}_v1_gapfill`;
  const fixtureUrl = new URL(v3Url);
  fixtureUrl.pathname = `/${fixtureName}`;

  let v3: pg.Client;
  let agencyCategoryId: number;
  let australiaId: number;
  let canadaId: number;

  function run(script: string, ...args: string[]): string {
    const isTs = script.endsWith(".ts");
    return execFileSync(
      process.execPath,
      [...(isTs ? ["--import", "tsx"] : []), `database/scripts/${script}`, ...args],
      {
        cwd: backendRoot,
        env: { ...process.env, V1_DATABASE_URL: fixtureUrl.toString(), V3_DATABASE_URL: v3Url },
        encoding: "utf8",
      },
    );
  }

  /** Everything this test wrote, as one comparable value (updated_at excluded). */
  async function snapshot(): Promise<string> {
    const biz = await v3.query(
      `SELECT id, subdomain, business_name, business_category_id, business_registration_number,
              registration_licenses, postcode, youtube_url, whatsapp_url, gallery_images,
              video_urls, is_published, currency, schema_name
         FROM public.businesses WHERE meta->>'v1_business_id' = ANY($1) ORDER BY subdomain`,
      [[U.bizPublished, U.bizDraft]],
    );
    const profiles = await v3.query(
      `SELECT p.budget_currency, p.preferred_destinations, p.fields_of_study,
              p.preferred_degree_levels, p.expected_start_date, p.include_living_expenses,
              p.individual_category, p.linkedin_url, p.website_url, p.latitude, p.longitude
         FROM public.platform_user_profiles p
         JOIN public.platform_users u ON u.id = p.user_id
        WHERE u.uuid = ANY($1) ORDER BY u.uuid`,
      [Object.values(U)],
    );
    const agents: unknown[] = [];
    for (const b of biz.rows) {
      const { rows } = await v3.query(
        `SELECT platform_user_id, is_owner, added_by, meta FROM "${b.schema_name}".agents ORDER BY id`,
      );
      agents.push({ schema: b.schema_name, rows });
    }
    return JSON.stringify({ biz: biz.rows, profiles: profiles.rows, agents });
  }

  async function dropFixtureDatabase(admin: pg.Client) {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [fixtureName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${fixtureName}"`);
  }

  /** Remove anything this file wrote, including the provisioned tenant schemas. */
  async function cleanTarget(client: pg.Client) {
    const { rows } = await client.query(
      `SELECT schema_name FROM public.businesses WHERE meta->>'v1_business_id' = ANY($1)`,
      [[U.bizPublished, U.bizDraft]],
    );
    for (const r of rows) await client.query(`DROP SCHEMA IF EXISTS "${r.schema_name}" CASCADE`);
    await client.query(`DELETE FROM public.businesses WHERE meta->>'v1_business_id' = ANY($1)`, [
      [U.bizPublished, U.bizDraft],
    ]);
    await client.query(`DELETE FROM public.platform_users WHERE uuid = ANY($1)`, [Object.values(U)]);
  }

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: v3Url });
    await admin.connect();
    await dropFixtureDatabase(admin);
    await admin.query(`CREATE DATABASE "${fixtureName}"`);
    await admin.end();

    const fixture = new pg.Client({ connectionString: fixtureUrl.toString() });
    await fixture.connect();
    await fixture.query(FIXTURE_SQL);
    await fixture.end();

    v3 = new pg.Client({ connectionString: v3Url });
    await v3.connect();
    await cleanTarget(v3);

    // Reference data the mappings resolve against — seeded here rather than
    // assumed, so a wiped test database still runs this file.
    await v3.query(
      `INSERT INTO public.business_categories (slug, name) VALUES ('education_agency', 'Education Agency')
       ON CONFLICT (slug) DO NOTHING`,
    );
    await v3.query(
      `INSERT INTO public.countries (name, iso2, iso3) VALUES ('Australia','AU','AUS'), ('Canada','CA','CAN')
       ON CONFLICT (iso2) DO NOTHING`,
    );
    const ids = await v3.query(
      `SELECT (SELECT id FROM public.business_categories WHERE slug = 'education_agency') AS cat,
              (SELECT id FROM public.countries WHERE iso2 = 'AU') AS au,
              (SELECT id FROM public.countries WHERE iso2 = 'CA') AS ca`,
    );
    agencyCategoryId = ids.rows[0].cat;
    australiaId = ids.rows[0].au;
    canadaId = ids.rows[0].ca;

    run("import-v1-users.mjs", "--apply");
    run("import-v1-businesses.ts", "--apply");
  });

  afterAll(async () => {
    if (v3) {
      await cleanTarget(v3).catch(() => {});
      await v3.end().catch(() => {});
    }
    const admin = new pg.Client({ connectionString: v3Url });
    await admin.connect();
    await dropFixtureDatabase(admin);
    await admin.end();
  });

  const business = async (v1Id: string) => {
    const { rows } = await v3.query(`SELECT * FROM public.businesses WHERE meta->>'v1_business_id' = $1`, [v1Id]);
    return rows[0];
  };

  const profile = async (uuid: string) => {
    const { rows } = await v3.query(
      `SELECT p.* FROM public.platform_user_profiles p
         JOIN public.platform_users u ON u.id = p.user_id WHERE u.uuid = $1`,
      [uuid],
    );
    return rows[0];
  };

  describe("businesses.is_published", () => {
    it("carries V1's own publish flag, even when the listing is only 'pending'", async () => {
      const b = await business(U.bizPublished);
      expect(b.status).toBe("pending");
      expect(b.is_published).toBe(true);
    });

    it("leaves a verified-but-unpublished listing unpublished", async () => {
      const b = await business(U.bizDraft);
      expect(b.status).toBe("verified");
      expect(b.is_published).toBe(false);
    });
  });

  describe("businesses.business_category_id", () => {
    it("remaps the V1 uuid onto the V3 serial id via the category slug", async () => {
      const b = await business(U.bizPublished);
      expect(b.business_category_id).toBe(agencyCategoryId);
    });

    it("reports a category with no V3 counterpart instead of inventing one", async () => {
      const b = await business(U.bizDraft);
      expect(b.business_category_id).toBeNull();

      const output = run("import-v1-businesses.ts");
      expect(output).toContain("UNRESOLVED business_category_id");
      expect(output).toContain(U.catUnknown);
    });
  });

  describe("the remaining businesses columns", () => {
    it("writes every column that used to be declared NOT MIGRATED", async () => {
      const b = await business(U.bizPublished);
      expect(b.business_registration_number).toBe("ABN-12345");
      expect(b.registration_licenses).toEqual({ licenses: [{ type: "QEAC", number: "999" }] });
      expect(b.postcode).toBe("3000");
      expect(b.youtube_url).toBe("https://youtube.test/c");
      expect(b.whatsapp_url).toBe("https://wa.me/61400000000");
      expect(b.gallery_images).toEqual(["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"]);
      expect(b.video_urls).toEqual(["https://vid.test/1"]);
    });

    it("narrows the V1 currency label to the ISO-4217 code V3 stores", async () => {
      const b = await business(U.bizPublished);
      expect(b.currency).toBe("AUD");
    });
  });

  describe("platform_user_profiles study preferences", () => {
    it("turns country names into the jsonb array of country IDs V3 expects", async () => {
      const p = await profile(U.student);
      // Atlantis is dropped from the array (and reported), order is preserved.
      expect(p.preferred_destinations).toEqual([australiaId, canadaId]);
    });

    it("reports the destination it cannot resolve rather than dropping it silently", () => {
      const output = run("import-v1-users.mjs");
      expect(output).toContain("unresolved countries");
      expect(output).toContain("preferred_destinations=Atlantis");
    });

    it("reshapes preferred_fields text[] into fields_of_study [{name}]", async () => {
      const p = await profile(U.student);
      expect(p.fields_of_study).toEqual([{ name: "Computer Science & IT" }, { name: "Law" }]);
    });

    it("writes the remaining preference columns", async () => {
      const p = await profile(U.student);
      expect(p.budget_currency).toBe("AUD");
      expect(p.preferred_degree_levels).toEqual(["bachelor", "master"]);
      expect(p.expected_start_date).toBe("07-2026");
      expect(p.include_living_expenses).toBe(true);
      expect(p.linkedin_url).toBe("https://linkedin.test/stu");
      expect(p.website_url).toBe("https://stu.test");
      expect(Number(p.latitude)).toBeCloseTo(-37.8136123, 6);
      expect(Number(p.longitude)).toBeCloseTo(144.9630567, 6);
    });

    it("reports an individual_category V3 has no equivalent for", async () => {
      const p = await profile(U.student);
      expect(p.individual_category).toBeNull();

      const output = run("import-v1-users.mjs");
      expect(output).toContain("UNMAPPED individual_category");
      expect(output).toContain("wanderer");
    });
  });

  describe("tenant agents: position and invited_by", () => {
    it("carries the V1 job title onto agents.meta", async () => {
      const b = await business(U.bizPublished);
      const { rows } = await v3.query(
        `SELECT a.meta->>'position' AS position, u.uuid
           FROM "${b.schema_name}".agents a
           JOIN public.platform_users u ON u.id = a.platform_user_id`,
      );
      const byUuid = new Map(rows.map((r) => [r.uuid, r.position]));
      expect(byUuid.get(U.owner)).toBe("CEO and Founder");
      expect(byUuid.get(U.staff)).toBe("Admission Officer");
    });

    it("resolves invited_by to the inviter's agent row in the same schema", async () => {
      const b = await business(U.bizPublished);
      const { rows } = await v3.query(
        `SELECT inviter.uuid AS inviter_uuid, invitee.uuid AS invitee_uuid
           FROM "${b.schema_name}".agents a
           JOIN "${b.schema_name}".agents p ON p.id = a.added_by
           JOIN public.platform_users invitee ON invitee.id = a.platform_user_id
           JOIN public.platform_users inviter ON inviter.id = p.platform_user_id`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].invitee_uuid).toBe(U.staff);
      expect(rows[0].inviter_uuid).toBe(U.owner);
    });

    it("reports an inviter who is not an agent of that business instead of guessing", async () => {
      const b = await business(U.bizDraft);
      const { rows } = await v3.query(
        `SELECT count(*)::int AS n FROM "${b.schema_name}".agents WHERE added_by IS NOT NULL`,
      );
      expect(rows[0].n).toBe(0);

      const output = run("import-v1-businesses.ts", "--apply");
      expect(output).toContain("UNRESOLVED invited_by");
      expect(output).toContain(U.owner);
    });
  });

  describe("idempotency", () => {
    it("changes nothing on a second --apply of both importers", async () => {
      const before = await snapshot();

      const users = run("import-v1-users.mjs", "--apply");
      const businesses = run("import-v1-businesses.ts", "--apply");

      expect(users).toMatch(/inserted:\s+0\b/);
      expect(businesses).toMatch(/businesses:\s+2\b/);
      expect(await snapshot()).toBe(before);
    });
  });

  describe("dry run", () => {
    it("writes nothing", async () => {
      const before = await snapshot();
      expect(run("import-v1-users.mjs")).toContain("nothing was written");
      expect(run("import-v1-businesses.ts")).toContain("nothing was written");
      expect(await snapshot()).toBe(before);
    });
  });
});
