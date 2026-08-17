// Exercises database/scripts/backfill-extraction-reference-ids.mjs against a
// V1-shaped fixture, plus the migration it depends on
// (20260816_001_extraction_reference_fks).
//
// The fixture lives in its own schema (V1_SCHEMA), so the script's real V1
// connection, transaction and resolver all run unchanged — only the source
// schema name differs. Everything is rebuilt in beforeAll, so a wiped test
// database is not a failure mode.

import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { dbAvailable } from "../helpers/db.js";
import { testDatabaseUrl } from "../setup/db-url.js";

const run = promisify(execFile);
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(BACKEND_ROOT, "database/scripts/backfill-extraction-reference-ids.mjs");
const FIXTURE_SCHEMA = "v1_ref_fixture";

const JOB = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const FEE_RESOLVED = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";
const FEE_UNRESOLVED = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const FEE_NO_REF = "bbbbbbbb-3333-4333-8333-bbbbbbbbbbbb";
const ELIG_RESOLVED = "cccccccc-1111-4111-8111-cccccccccccc";
const ELIG_GHOST = "cccccccc-9999-4999-8999-cccccccccccc"; // in V1, never imported

const V1_FEE_TYPE = "dddddddd-1111-4111-8111-dddddddddddd";
const V1_FEE_TYPE_UNKNOWN = "dddddddd-2222-4222-8222-dddddddddddd";
const V1_DEGREE_LEVEL = "eeeeeeee-1111-4111-8111-eeeeeeeeeeee";

// Fixture-only vocabulary names so this suite never collides with the shared
// reference data other waves seed into public.*.
const FEE_NAME = "BP2 Fixture Tuition Fee";
const FEE_NAME_UNKNOWN = "BP2 Fixture Fee (no V3 row)";
const DEGREE_NAME = "BP2 Fixture High School";

let db: pg.Client;
let feeTypeId: number;
let degreeLevelId: number;

/** Run the backfill against the fixture. Resolves even on a non-zero exit. */
async function backfill(...args: string[]) {
  const env = {
    ...process.env,
    V1_DATABASE_URL: testDatabaseUrl(),
    V3_DATABASE_URL: testDatabaseUrl(),
    V1_SCHEMA: FIXTURE_SCHEMA,
  };
  try {
    const { stdout, stderr } = await run(process.execPath, [SCRIPT, ...args], { env, cwd: BACKEND_ROOT });
    return { code: 0, out: stdout + stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

async function refs(table: string, column: string) {
  const { rows } = await db.query(`SELECT id::text AS id, ${column} AS ref FROM superadmin.${table} ORDER BY id`);
  return new Map<string, number | null>(rows.map((r) => [r.id, r.ref]));
}

async function createFixtureSchema() {
  await db.query(`DROP SCHEMA IF EXISTS ${FIXTURE_SCHEMA} CASCADE`);
  await db.query(`CREATE SCHEMA ${FIXTURE_SCHEMA}`);
  // V1 kept both vocabularies as uuid, and both staged columns as uuid FKs.
  await db.query(`
    CREATE TABLE ${FIXTURE_SCHEMA}.fee_types     (id uuid PRIMARY KEY, name text);
    CREATE TABLE ${FIXTURE_SCHEMA}.degree_levels (id uuid PRIMARY KEY, name text);
    CREATE TABLE ${FIXTURE_SCHEMA}.extraction_course_fees (
      id uuid PRIMARY KEY, fee_type_id uuid REFERENCES ${FIXTURE_SCHEMA}.fee_types(id));
    CREATE TABLE ${FIXTURE_SCHEMA}.extraction_eligibility_requirements (
      id uuid PRIMARY KEY, degree_level_id uuid REFERENCES ${FIXTURE_SCHEMA}.degree_levels(id));
  `);
}

/** Reset both sides, then seed the V1 corpus and its already-imported V3 rows. */
async function seedFixture() {
  await db.query(`TRUNCATE ${FIXTURE_SCHEMA}.extraction_course_fees,
                           ${FIXTURE_SCHEMA}.extraction_eligibility_requirements,
                           ${FIXTURE_SCHEMA}.fee_types, ${FIXTURE_SCHEMA}.degree_levels CASCADE`);
  await db.query(`TRUNCATE superadmin.extraction_jobs CASCADE`);
  await db.query(`DELETE FROM public.fee_types WHERE name = $1`, [FEE_NAME]);
  await db.query(`DELETE FROM public.degree_levels WHERE name = $1`, [DEGREE_NAME]);

  // ── V3 vocabulary: only the fee type and degree level that should resolve ──
  const fee = await db.query(
    `INSERT INTO public.fee_types (name, slug, status, is_global) VALUES ($1, 'bp2_fixture_tuition_fee', 'approved', true) RETURNING id`,
    [FEE_NAME],
  );
  feeTypeId = fee.rows[0].id;
  const degree = await db.query(
    `INSERT INTO public.degree_levels (name, slug) VALUES ($1, 'bp2_fixture_high_school') RETURNING id`,
    [DEGREE_NAME],
  );
  degreeLevelId = degree.rows[0].id;

  // ── V1 source ──
  await db.query(`INSERT INTO ${FIXTURE_SCHEMA}.fee_types VALUES ($1, $2), ($3, $4)`, [
    V1_FEE_TYPE, FEE_NAME, V1_FEE_TYPE_UNKNOWN, FEE_NAME_UNKNOWN,
  ]);
  await db.query(`INSERT INTO ${FIXTURE_SCHEMA}.degree_levels VALUES ($1, $2)`, [V1_DEGREE_LEVEL, DEGREE_NAME]);
  await db.query(
    `INSERT INTO ${FIXTURE_SCHEMA}.extraction_course_fees VALUES ($1, $2), ($3, $4), ($5, NULL)`,
    [FEE_RESOLVED, V1_FEE_TYPE, FEE_UNRESOLVED, V1_FEE_TYPE_UNKNOWN, FEE_NO_REF],
  );
  await db.query(
    `INSERT INTO ${FIXTURE_SCHEMA}.extraction_eligibility_requirements VALUES ($1, $2), ($3, $4)`,
    [ELIG_RESOLVED, V1_DEGREE_LEVEL, ELIG_GHOST, V1_DEGREE_LEVEL],
  );

  // ── V3 side, as the extraction import left it: every reference NULL ──
  await db.query(`INSERT INTO superadmin.extraction_jobs (id, institution_url) VALUES ($1, 'https://bp2.example.edu')`, [JOB]);
  await db.query(
    `INSERT INTO superadmin.extraction_course_fees (id, job_id) VALUES ($1, $4), ($2, $4), ($3, $4)`,
    [FEE_RESOLVED, FEE_UNRESOLVED, FEE_NO_REF, JOB],
  );
  // ELIG_GHOST deliberately absent — a V1 row with no V3 counterpart.
  await db.query(`INSERT INTO superadmin.extraction_eligibility_requirements (id, job_id) VALUES ($1, $2)`, [
    ELIG_RESOLVED, JOB,
  ]);
}

const describeDb = dbAvailable ? describe : describe.skip;

describeDb("backfill-extraction-reference-ids", () => {
  beforeAll(async () => {
    db = new pg.Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    await createFixtureSchema();
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    await db.query(`DROP SCHEMA IF EXISTS ${FIXTURE_SCHEMA} CASCADE`).catch(() => {});
    await db.query(`TRUNCATE superadmin.extraction_jobs CASCADE`).catch(() => {});
    await db.query(`DELETE FROM public.fee_types WHERE name = $1`, [FEE_NAME]).catch(() => {});
    await db.query(`DELETE FROM public.degree_levels WHERE name = $1`, [DEGREE_NAME]).catch(() => {});
    await db.end();
  });

  beforeEach(seedFixture);

  describe("migration 20260816_001_extraction_reference_fks", () => {
    it("retypes both staged reference columns to integer", async () => {
      const { rows } = await db.query(
        `SELECT table_name, column_name, data_type FROM information_schema.columns
          WHERE table_schema = 'superadmin'
            AND (table_name, column_name) IN
                (('extraction_course_fees', 'fee_type_id'),
                 ('extraction_eligibility_requirements', 'degree_level_id'))
          ORDER BY table_name`,
      );
      expect(rows.map((r) => r.data_type)).toEqual(["integer", "integer"]);
    });

    it("gives each one a real FK into the public vocabulary", async () => {
      // pg_get_constraintdef() hides the schema when it is on the search_path,
      // so the parent is read from the catalog rather than matched as text.
      const { rows } = await db.query(
        `SELECT t.relname AS child, pn.nspname || '.' || p.relname AS parent
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
           JOIN pg_class p ON p.oid = c.confrelid
           JOIN pg_namespace pn ON pn.oid = p.relnamespace
          WHERE n.nspname = 'superadmin' AND c.contype = 'f'
            AND t.relname IN ('extraction_course_fees', 'extraction_eligibility_requirements')
            AND pn.nspname = 'public'
          ORDER BY 1`,
      );
      expect(rows).toEqual([
        { child: "extraction_course_fees", parent: "public.fee_types" },
        { child: "extraction_eligibility_requirements", parent: "public.degree_levels" },
      ]);
    });

    it("leaves superadmin.fee_types resolving to the public rows", async () => {
      const { rows } = await db.query(`SELECT id, name FROM superadmin.fee_types WHERE name = $1`, [FEE_NAME]);
      expect(rows).toEqual([{ id: feeTypeId, name: FEE_NAME }]);
    });

    it("drops the orphaned superadmin.accreditations placeholder", async () => {
      const { rows } = await db.query(
        `SELECT to_regclass('superadmin.accreditations') IS NULL AS gone`,
      );
      expect(rows[0].gone).toBe(true);
    });
  });

  describe("backfill", () => {
    it("dry run reports the repairs but writes nothing", async () => {
      const { code, out } = await backfill();
      expect(code).toBe(0);
      expect(out).toContain("DRY RUN");
      expect(out).toContain("repaired (NULL -> id):  2");
      expect(await refs("extraction_course_fees", "fee_type_id")).toEqual(
        new Map([[FEE_RESOLVED, null], [FEE_UNRESOLVED, null], [FEE_NO_REF, null]]),
      );
    });

    it("--apply writes the ids V1 had, and only those", async () => {
      const { code, out } = await backfill("--apply");
      expect(code).toBe(0);

      expect(await refs("extraction_course_fees", "fee_type_id")).toEqual(
        new Map([
          [FEE_RESOLVED, feeTypeId],
          [FEE_UNRESOLVED, null], // V1 name has no V3 row
          [FEE_NO_REF, null], // V1 never set one — staging free text, correct as NULL
        ]),
      );
      expect(await refs("extraction_eligibility_requirements", "degree_level_id")).toEqual(
        new Map([[ELIG_RESOLVED, degreeLevelId]]),
      );

      expect(out).toContain("extraction_course_fees.fee_type_id");
      expect(out).toContain("3 -> 2"); // NULL count for the fees table
    });

    it("reports the unresolvable V1 name instead of dropping it silently", async () => {
      const { out } = await backfill("--apply");
      expect(out).toContain("STILL UNRESOLVED");
      expect(out).toContain(FEE_NAME_UNKNOWN);
    });

    it("reports V1 rows the extraction import never brought across", async () => {
      const { out } = await backfill("--apply");
      expect(out).toContain("V1 rows with no V3 counterpart");
      expect(out).toContain(ELIG_GHOST);
    });

    it("is idempotent — a second run changes nothing", async () => {
      await backfill("--apply");
      const before = await refs("extraction_course_fees", "fee_type_id");

      const { code, out } = await backfill("--apply");
      expect(code).toBe(0);
      expect(out).toContain("repaired (NULL -> id):  0");
      expect(out).toContain("corrected (wrong id):   0");
      expect(await refs("extraction_course_fees", "fee_type_id")).toEqual(before);
    });

    it("corrects a row that points at the wrong fee type", async () => {
      const other = await db.query(
        `INSERT INTO public.fee_types (name, slug, status, is_global)
         VALUES ($1, 'bp2_fixture_other_fee', 'approved', true) RETURNING id`,
        [`${FEE_NAME} (other)`],
      );
      try {
        await db.query(`UPDATE superadmin.extraction_course_fees SET fee_type_id = $1 WHERE id = $2`, [
          other.rows[0].id, FEE_RESOLVED,
        ]);
        const { out } = await backfill("--apply");
        expect(out).toContain("corrected (wrong id):   1");
        const after = await refs("extraction_course_fees", "fee_type_id");
        expect(after.get(FEE_RESOLVED)).toBe(feeTypeId);
      } finally {
        await db.query(`UPDATE superadmin.extraction_course_fees SET fee_type_id = NULL`);
        await db.query(`DELETE FROM public.fee_types WHERE id = $1`, [other.rows[0].id]);
      }
    });

    it("--self-check passes without touching a database", async () => {
      const { code, out } = await backfill("--self-check");
      expect(code).toBe(0);
      expect(out).toContain("all assertions passed");
    });
  });
});
