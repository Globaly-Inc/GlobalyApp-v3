// Exercises database/scripts/import-v1-extraction.mjs end to end against a
// V1-shaped fixture. The fixture lives in its own schema in the test database
// (V1_SCHEMA), so the script's real V1 connection, transaction and count
// assertions all run unchanged — only the source schema name differs.

import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { dbAvailable } from "../helpers/db.js";
import { testDatabaseUrl } from "../setup/db-url.js";
// @ts-expect-error — plain .mjs migration helper, no type declarations by design.
import { LOAD_PLAN } from "../../database/scripts/extraction-transforms.mjs";

const run = promisify(execFile);
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(BACKEND_ROOT, "database/scripts/import-v1-extraction.mjs");
const FIXTURE_SCHEMA = "v1_fixture";

const PLAN = LOAD_PLAN as { table: string; conflictKey?: string[] }[];
const PLAN_TABLES = PLAN.map((s) => s.table);
const ALL_TABLES = [...PLAN_TABLES, "extraction_job_events"];

const JOB = "11111111-1111-4111-8111-111111111111";
const COURSE = "22222222-2222-4222-8222-222222222222";
const COURSE_2 = "22222222-2222-4222-8222-222222222223";
const CAMPUS = "33333333-3333-4333-8333-333333333333";
const GHOST_COURSE = "99999999-9999-4999-8999-999999999999";
const BUSINESS_CATEGORY = "44444444-4444-4444-8444-444444444444";
const SERVICE_CATEGORY = "55555555-5555-4555-8555-555555555555";
const FEE_TYPE = "66666666-6666-4666-8666-666666666666";
const MATCHED_CATEGORY = "B3 Fixture Institutions";
const UNMATCHED_CATEGORY = "B3 Fixture Service (no V3 row)";
const UNMATCHED_FEE_TYPE = "B3 Fixture Fee (no V3 row)";
const FIXTURE_SLUG = "b3-fixture-institutions";

let db: pg.Client;
// pgvector may be installed outside search_path, so the type name is read from
// the catalog rather than assumed to be a bare "vector".
let vectorType = "vector";
let vectorDims = 768;

/** Run the loader against the fixture. Resolves even on a non-zero exit. */
async function importer(...args: string[]) {
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

async function count(table: string): Promise<number> {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM superadmin."${table}"`);
  return rows[0].n;
}

/** V1-shaped source tables, cloned from the V3 shapes and de-migrated. */
async function createFixtureSchema() {
  await db.query(`DROP SCHEMA IF EXISTS ${FIXTURE_SCHEMA} CASCADE`);
  await db.query(`CREATE SCHEMA ${FIXTURE_SCHEMA}`);
  for (const table of ALL_TABLES) {
    await db.query(`CREATE TABLE ${FIXTURE_SCHEMA}."${table}" (LIKE superadmin."${table}" INCLUDING DEFAULTS)`);
  }
  // The handful of columns where V1 and V3 genuinely differ in type.
  await db.query(`
    ALTER TABLE ${FIXTURE_SCHEMA}.extraction_jobs
      ALTER COLUMN business_category_id TYPE uuid USING NULL,
      ALTER COLUMN service_category_id  TYPE uuid USING NULL;
    ALTER TABLE ${FIXTURE_SCHEMA}.extraction_courses
      ALTER COLUMN domestic_fee_installments      TYPE text USING NULL,
      ALTER COLUMN international_fee_installments TYPE text USING NULL;
    ALTER TABLE ${FIXTURE_SCHEMA}.extraction_course_fees
      ALTER COLUMN fee_type_id TYPE uuid USING NULL;
    ALTER TABLE ${FIXTURE_SCHEMA}.extraction_eligibility_requirements
      ALTER COLUMN degree_level_id TYPE uuid USING NULL;
  `);
  // V1 reference tables the loader resolves category / fee / degree FKs against.
  await db.query(`
    CREATE TABLE ${FIXTURE_SCHEMA}.business_categories (id uuid PRIMARY KEY, name text);
    CREATE TABLE ${FIXTURE_SCHEMA}.service_categories  (id uuid PRIMARY KEY, name text);
    CREATE TABLE ${FIXTURE_SCHEMA}.fee_types           (id uuid PRIMARY KEY, name text);
    CREATE TABLE ${FIXTURE_SCHEMA}.degree_levels       (id uuid PRIMARY KEY, name text);
  `);
}

/** Reset both sides, then seed a small but FK-complete V1 corpus. */
async function seedFixture() {
  for (const table of ALL_TABLES) await db.query(`TRUNCATE ${FIXTURE_SCHEMA}."${table}"`);
  for (const table of [...ALL_TABLES].reverse()) await db.query(`TRUNCATE superadmin."${table}" CASCADE`);
  await db.query(`TRUNCATE ${FIXTURE_SCHEMA}.business_categories, ${FIXTURE_SCHEMA}.service_categories,
                           ${FIXTURE_SCHEMA}.fee_types, ${FIXTURE_SCHEMA}.degree_levels`);

  // Fixture-only category names, so this suite never deletes or depends on the
  // shared reference data other waves seed into public.*/superadmin.*.
  await db.query(`INSERT INTO ${FIXTURE_SCHEMA}.business_categories VALUES ($1, $2)`, [BUSINESS_CATEGORY, MATCHED_CATEGORY]);
  await db.query(`INSERT INTO ${FIXTURE_SCHEMA}.service_categories VALUES ($1, $2)`, [SERVICE_CATEGORY, UNMATCHED_CATEGORY]);
  await db.query(`INSERT INTO ${FIXTURE_SCHEMA}.fee_types VALUES ($1, $2)`, [FEE_TYPE, UNMATCHED_FEE_TYPE]);
  // Only the business category has a V3 counterpart — the service category and
  // fee type are the "B1 has not landed yet" case: report and NULL, never fail.
  await db.query(
    `INSERT INTO public.business_categories (name, slug) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [MATCHED_CATEGORY, FIXTURE_SLUG],
  );

  await db.query(
    `INSERT INTO ${FIXTURE_SCHEMA}.extraction_jobs (id, institution_url, business_category_id, service_category_id)
     VALUES ($1, 'https://example.edu', $2, $3)`,
    [JOB, BUSINESS_CATEGORY, SERVICE_CATEGORY],
  );
  await db.query(
    `INSERT INTO ${FIXTURE_SCHEMA}.extraction_courses (id, job_id, name, domestic_fee_installments)
     VALUES ($1, $3, 'Bachelor of Testing', 'Payable in five installments'),
            ($2, $3, 'Master of Assertions', '{"count":3}')`,
    [COURSE, COURSE_2, JOB],
  );
  await db.query(`INSERT INTO ${FIXTURE_SCHEMA}.extraction_campuses (id, job_id) VALUES ($1, $2)`, [CAMPUS, JOB]);
  await db.query(
    `INSERT INTO ${FIXTURE_SCHEMA}.extraction_agents (id, job_id, external_id, country)
     VALUES (gen_random_uuid(), $1, 'a-1', 'INDIA'), (gen_random_uuid(), $1, 'a-2', 'VIET NAM')`,
    [JOB],
  );
  await db.query(
    `INSERT INTO ${FIXTURE_SCHEMA}.extraction_course_fees (id, job_id, fee_type_id)
     VALUES (gen_random_uuid(), $1, $2)`,
    [JOB, FEE_TYPE],
  );
  await db.query(
    `INSERT INTO ${FIXTURE_SCHEMA}.extraction_course_campuses (id, job_id, course_id, campus_id)
     VALUES (gen_random_uuid(), $1, $2, $3), (gen_random_uuid(), $1, $4, $3)`,
    [JOB, COURSE, CAMPUS, COURSE_2],
  );
}

const describeDb = dbAvailable ? describe : describe.skip;

describeDb("import-v1-extraction", () => {
  beforeAll(async () => {
    db = new pg.Client({ connectionString: testDatabaseUrl() });
    await db.connect();
    await createFixtureSchema();

    const { rows } = await db.query(
      `SELECT format_type(atttypid, atttypmod) AS t
         FROM pg_attribute
        WHERE attrelid = 'superadmin.extraction_memory'::regclass AND attname = 'embedding'`,
    );
    vectorType = rows[0].t.replace(/\(\d+\)$/, "");
    vectorDims = Number(/\((\d+)\)$/.exec(rows[0].t)![1]);
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    await db.query(`DROP SCHEMA IF EXISTS ${FIXTURE_SCHEMA} CASCADE`).catch(() => {});
    for (const table of [...ALL_TABLES].reverse()) {
      await db.query(`TRUNCATE superadmin."${table}" CASCADE`).catch(() => {});
    }
    await db.query(`DELETE FROM public.business_categories WHERE slug = $1`, [FIXTURE_SLUG]).catch(() => {});
    await db.end().catch(() => {});
  });

  beforeEach(seedFixture);

  it("passes its own pure-helper self-check", async () => {
    const { code, out } = await importer("--self-check");
    expect(out).toContain("self-check: all assertions passed");
    expect(code).toBe(0);
  });

  it("writes nothing on a dry run", async () => {
    const { code, out } = await importer();
    expect(code).toBe(0);
    expect(out).toContain("nothing was written");
    expect(await count("extraction_courses")).toBe(0);
    expect(await count("extraction_course_campuses")).toBe(0);
  });

  it("loads every planned table with target counts matching source", async () => {
    const { code, out } = await importer("--apply");
    expect(code, out).toBe(0);
    expect(await count("extraction_jobs")).toBe(1);
    expect(await count("extraction_courses")).toBe(2);
    expect(await count("extraction_campuses")).toBe(1);
    expect(await count("extraction_agents")).toBe(2);
    expect(await count("extraction_course_campuses")).toBe(2);
  });

  it("preserves the V1 uuid identity verbatim on every row", async () => {
    await importer("--apply");
    const { rows } = await db.query(
      `SELECT c.id::text AS id, c.job_id::text AS job_id FROM superadmin.extraction_courses c ORDER BY c.id`,
    );
    expect(rows.map((r) => r.id)).toEqual([COURSE, COURSE_2]);
    expect(rows.every((r) => r.job_id === JOB)).toBe(true);
  });

  it("remaps the V1 category uuid onto the V3 serial id", async () => {
    await importer("--apply");
    const { rows } = await db.query(
      `SELECT j.business_category_id, j.service_category_id
         FROM superadmin.extraction_jobs j
         JOIN public.business_categories b ON b.id = j.business_category_id
        WHERE b.name = $1`,
      [MATCHED_CATEGORY],
    );
    expect(rows).toHaveLength(1);
    expect(typeof rows[0].business_category_id).toBe("number");
    // The service category has no V3 row yet (B1 owns it) — NULLed, not fatal.
    expect(rows[0].service_category_id).toBeNull();
  });

  it("reports every reference it had to NULL instead of failing the load", async () => {
    const { code, out } = await importer("--apply");
    expect(code).toBe(0);
    expect(out).toContain("UNRESOLVED REFERENCES");
    expect(out).toContain("extraction_jobs.service_category_id");
    expect(out).toContain("extraction_course_fees.fee_type_id");
    expect(out).not.toContain("extraction_jobs.business_category_id");
    const { rows } = await db.query(`SELECT fee_type_id FROM superadmin.extraction_course_fees`);
    expect(rows[0].fee_type_id).toBeNull();
  });

  it("normalizes dirty free-text agent countries and says what it changed", async () => {
    const { out } = await importer("--apply");
    const { rows } = await db.query(`SELECT country FROM superadmin.extraction_agents ORDER BY country`);
    expect(rows.map((r) => r.country)).toEqual(["India", "Vietnam"]);
    expect(out).toContain("INDIA -> India");
    expect(out).toContain("VIET NAM -> Vietnam");
  });

  it("keeps V1 prose that landed in a jsonb column, as a JSON string", async () => {
    await importer("--apply");
    const { rows } = await db.query(
      `SELECT domestic_fee_installments AS v FROM superadmin.extraction_courses WHERE id = $1`,
      [COURSE],
    );
    expect(rows[0].v).toBe("Payable in five installments");
    const { rows: json } = await db.query(
      `SELECT domestic_fee_installments AS v FROM superadmin.extraction_courses WHERE id = $1`,
      [COURSE_2],
    );
    expect(json[0].v).toEqual({ count: 3 });
  });

  /** A literal of `dims` distinct floats, cast to the local pgvector type. */
  const vectorLiteral = (dims: number) =>
    `(SELECT '[' || string_agg((i::float8 / 7)::text, ',' ORDER BY i) || ']'
        FROM generate_series(1, ${dims}) i)::${vectorType}(${dims})`;

  it("round-trips a pgvector embedding byte for byte", async () => {
    // Both sides declare the same width here, so the text-cast transfer has to
    // reproduce the vector exactly — checked, not assumed.
    await db.query(
      `INSERT INTO ${FIXTURE_SCHEMA}.extraction_memory (id, job_id, domain, step, entity_type, ai_output, embedding)
       VALUES (gen_random_uuid(), $1, 'example.edu', 'course', 'course', '{"ok":true}'::jsonb, ${vectorLiteral(vectorDims)})`,
      [JOB],
    );

    const { code, out } = await importer("--apply");
    expect(code, out).toBe(0);
    expect(out).not.toContain("SCHEMA BLOCKERS");

    const { rows } = await db.query(
      `SELECT s.embedding::text AS src, t.embedding::text AS tgt
         FROM ${FIXTURE_SCHEMA}.extraction_memory s
         JOIN superadmin.extraction_memory t ON t.id = s.id`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tgt).toBe(rows[0].src);
    // Guard against the equality above passing on two nulls or two empty vectors.
    expect(rows[0].tgt.split(",")).toHaveLength(vectorDims);
    expect(rows[0].tgt.startsWith("[0.14285")).toBe(true);
  });

  it("NULLs the embedding and shouts when the two sides disagree on vector width", async () => {
    const wide = vectorDims * 2;
    await db.query(
      `ALTER TABLE ${FIXTURE_SCHEMA}.extraction_memory ALTER COLUMN embedding TYPE ${vectorType}(${wide})`,
    );
    try {
      await db.query(
        `INSERT INTO ${FIXTURE_SCHEMA}.extraction_memory (id, job_id, domain, step, entity_type, ai_output, embedding)
         VALUES (gen_random_uuid(), $1, 'example.edu', 'course', 'course', '{}'::jsonb, ${vectorLiteral(wide)})`,
        [JOB],
      );
      const { code, out } = await importer("--apply");
      // The row still lands — a schema mismatch must not cost the whole corpus.
      expect(code, out).toBe(0);
      expect(out).toContain("SCHEMA BLOCKERS");
      expect(out).toContain(`is vector(${vectorDims}) but V1 is vector(${wide})`);
      const { rows } = await db.query(`SELECT embedding FROM superadmin.extraction_memory`);
      expect(rows).toHaveLength(1);
      expect(rows[0].embedding).toBeNull();
    } finally {
      await db.query(`TRUNCATE ${FIXTURE_SCHEMA}.extraction_memory`);
      await db.query(
        `ALTER TABLE ${FIXTURE_SCHEMA}.extraction_memory ALTER COLUMN embedding TYPE ${vectorType}(${vectorDims})`,
      );
    }
  });

  it("inserts zero on a second --apply", async () => {
    await importer("--apply");
    const before = await count("extraction_course_campuses");
    const { code, out } = await importer("--apply");
    expect(code).toBe(0);
    expect(out).toContain("(0 newly inserted)");
    expect(await count("extraction_course_campuses")).toBe(before);
  });

  it("skips extraction_job_events by default and loads it behind --with-events", async () => {
    await db.query(
      `INSERT INTO ${FIXTURE_SCHEMA}.extraction_job_events (id, job_id, kind, level)
       VALUES (gen_random_uuid(), $1, 'progress', 'info')`,
      [JOB],
    );
    const first = await importer("--apply");
    expect(first.out).toContain("extraction_job_events: log spool");
    expect(await count("extraction_job_events")).toBe(0);

    await importer("--apply", "--with-events");
    expect(await count("extraction_job_events")).toBe(1);
  });

  it("never migrates scrape_smoke_results", async () => {
    const { out } = await importer("--apply");
    expect(out).toContain("scrape_smoke_results: scraper CI test-harness output");
    expect(PLAN_TABLES).not.toContain("scrape_smoke_results");
  });

  describe("the ordering trap", () => {
    it("reports a junction row whose parent is missing rather than dropping it silently", async () => {
      await db.query(
        `INSERT INTO ${FIXTURE_SCHEMA}.extraction_course_campuses (id, job_id, course_id, campus_id)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [JOB, GHOST_COURSE, CAMPUS],
      );

      const { code, out } = await importer("--apply");
      expect(code, out).toBe(0);
      expect(out).toContain("SKIPPED ROWS");
      expect(out).toContain("1 x extraction_course_campuses.course_id -> extraction_courses");
      expect(out).toContain(GHOST_COURSE);
      // Two good rows in; the orphan stayed out and was counted, not swallowed.
      expect(await count("extraction_course_campuses")).toBe(2);
    });

    it("aborts the whole transaction when a parent table loads short", async () => {
      // A trigger that quietly eats one course is exactly the failure mode the
      // count assertion exists to catch: no FK error, just a missing parent.
      await db.query(`
        CREATE FUNCTION pg_temp_swallow() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RETURN CASE WHEN NEW.id = '${COURSE_2}'::uuid THEN NULL ELSE NEW END; END $$;
        CREATE TRIGGER swallow_one BEFORE INSERT ON superadmin.extraction_courses
          FOR EACH ROW EXECUTE FUNCTION pg_temp_swallow();
      `);
      try {
        const { code, out } = await importer("--apply");
        expect(code).toBe(1);
        expect(out).toContain("extraction_courses: count assertion failed");
        expect(out).toContain("Aborting before dependent tables load");
        // Single transaction: the job that loaded fine is rolled back too.
        expect(await count("extraction_jobs")).toBe(0);
        expect(await count("extraction_courses")).toBe(0);
        expect(await count("extraction_course_campuses")).toBe(0);
      } finally {
        await db.query(`DROP TRIGGER swallow_one ON superadmin.extraction_courses; DROP FUNCTION pg_temp_swallow();`);
      }
    });

    it("refuses to load a junction before its parents are verified", async () => {
      // Guard against a future edit reordering LOAD_PLAN: junctions must sit
      // after both parents, and missingParents() is what enforces it at runtime.
      const order = PLAN_TABLES;
      for (const junction of [
        "extraction_course_campuses",
        "extraction_course_fee_assignments",
        "extraction_course_intake_assignments",
      ]) {
        expect(order.indexOf(junction)).toBeGreaterThan(order.indexOf("extraction_courses"));
      }
    });
  });
});
