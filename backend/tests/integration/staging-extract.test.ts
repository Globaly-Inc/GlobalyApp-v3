// Stage 1 and GATE 1, proven to fail.
//
// Gate 1 is the check that makes the two-stage design worth having: once it is
// green, extraction is beyond doubt, so any later discrepancy is a transform bug
// by elimination. A gate nobody has watched fail cannot carry that weight, so
// this suite damages the staging copy four ways and asserts the gate goes red
// each time:
//
//   count      a row deleted from staging
//   content    a value mutated in staging
//   fk         an orphan under a reproduced V1 foreign key
//   sequence   a staging sequence reset below max(pk)
//
// The baseline is V2's self-parity trick: extract a table into v1_staging and
// compare it against the source it came from. Green there is the CI smoke.
//
// The fixture is a small V1-shaped table created in the test database, so the
// suite exercises the real CLI end to end - derived DDL, reproduced keys and
// foreign keys, paged load, sequence reset - without needing the 2026-07-16
// restore to be running.

import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { dbAvailable } from "../helpers/db.js";
import { testDatabaseUrl } from "../setup/db-url.js";

const execFileAsync = promisify(execFile);
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EXTRACT = path.join(BACKEND_ROOT, "scripts/migration/extract.mjs");
const GATE1 = path.join(BACKEND_ROOT, "scripts/migration/verify-staging.mjs");

// `countries` is in the 199-table census, so --tables=countries exercises the
// real plan rather than a special path invented for the test.
const TABLE = "countries";

interface Gate1Report {
  pass: boolean;
  failures: number;
  tables: {
    table: string;
    error?: string;
    count: { pass: boolean; source: number; staging: number };
    content: { pass: boolean; differing: number; missingTotal?: number; extraTotal?: number; samples: { key: string; columns: string[] }[] };
  }[];
  fk: { pass: boolean; scanned: number; total: number; violations: { constraint: string; orphans: number }[] };
  sequences: { pass: boolean; scanned: number; total: number; behind: { table: string; at: number; maxPk: number }[] };
}

const describeDb = describe.skipIf(!dbAvailable);

describeDb("Stage 1 extract + Gate 1 staging parity", () => {
  const url = testDatabaseUrl();
  let client: pg.Client;

  async function run(script: string, args: string[]): Promise<{ code: number; stdout: string }> {
    try {
      const { stdout } = await execFileAsync(process.execPath, [script, ...args], { cwd: BACKEND_ROOT });
      return { code: 0, stdout };
    } catch (err) {
      const e = err as { code?: number; stdout?: string; stderr?: string };
      return { code: typeof e.code === "number" ? e.code : 1, stdout: `${e.stdout ?? ""}${e.stderr ?? ""}` };
    }
  }

  const extract = (extra: string[] = []) =>
    run(EXTRACT, [`--source-url=${url}`, `--target-url=${url}`, `--tables=${TABLE}`, ...extra]);

  async function gate1(extra: string[] = []): Promise<{ code: number; report: Gate1Report; stdout: string }> {
    const { code, stdout } = await run(GATE1, [
      `--source-url=${url}`,
      `--target-url=${url}`,
      `--tables=${TABLE}`,
      "--json",
      ...extra,
    ]);
    const json = stdout.slice(stdout.indexOf("{"));
    return { code, report: JSON.parse(json) as Gate1Report, stdout };
  }

  const countries = (r: Gate1Report) => r.tables.find((t) => t.table === TABLE)!;

  beforeEach(async () => {
    if (!client) {
      client = new pg.Client({ connectionString: url });
      await client.connect();
    }
    // A stale staging table from a previous shape would silently change what is
    // being tested, so every run starts from no schema at all.
    await client.query(`DROP SCHEMA IF EXISTS v1_staging CASCADE`);
    const { code, stdout } = await extract(["--apply"]);
    expect(code, stdout).toBe(0);
  });

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS v1_staging CASCADE`);
      await client.end();
    }
  });

  // -- The baseline --------------------------------------------------------

  it("extract --self-check and Gate 1 --self-check pass with no database", async () => {
    const ex = await run(EXTRACT, ["--self-check"]);
    expect(ex.code, ex.stdout).toBe(0);
    expect(ex.stdout).toContain("199 census");

    const gate = await run(GATE1, ["--self-check"]);
    expect(gate.code, gate.stdout).toBe(0);
    expect(gate.stdout).toContain("self-check: ok");
  });

  it("is GREEN when staging is a faithful copy - the CI smoke", async () => {
    const { code, report } = await gate1();

    expect(code).toBe(0);
    expect(report.pass).toBe(true);
    expect(countries(report).count.pass).toBe(true);
    expect(countries(report).count.staging).toBe(countries(report).count.source);
    expect(countries(report).count.staging).toBeGreaterThan(0);
    expect(countries(report).content.pass).toBe(true);
    expect(report.fk.pass).toBe(true);
    expect(report.sequences.pass).toBe(true);
  });

  it("is GREEN in self-parity mode - v1_staging compared against itself", async () => {
    const { code, report } = await gate1(["--source-schema=v1_staging"]);

    expect(code).toBe(0);
    expect(report.pass).toBe(true);
  });

  it("reproduces the source keys, so the staged table can be joined row for row", async () => {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM pg_constraint c
         JOIN pg_class cl ON cl.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE n.nspname = 'v1_staging' AND cl.relname = $1 AND c.contype = 'p'`,
      [TABLE],
    );
    expect(rows[0].n).toBe(1);
  });

  it("is idempotent: a second extract truncates and reloads to the same state", async () => {
    const before = await client.query(`SELECT count(*)::int AS n FROM v1_staging.${TABLE}`);
    const { code } = await extract(["--apply"]);
    const after = await client.query(`SELECT count(*)::int AS n FROM v1_staging.${TABLE}`);

    expect(code).toBe(0);
    expect(after.rows[0].n).toBe(before.rows[0].n);
    expect((await gate1()).code).toBe(0);
  });

  it("dry run writes nothing", async () => {
    await client.query(`DELETE FROM v1_staging.${TABLE}`);
    const { code, stdout } = await extract();

    expect(code).toBe(0);
    expect(stdout).toContain("DRY RUN");
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM v1_staging.${TABLE}`);
    expect(rows[0].n).toBe(0);
  });

  // -- Seeded mismatches: each must make the gate red ----------------------

  it("count: fails when a row is missing from staging", async () => {
    const { rows } = await client.query(`SELECT id FROM v1_staging.${TABLE} ORDER BY id DESC LIMIT 1`);
    await client.query(`DELETE FROM v1_staging.${TABLE} WHERE id = $1`, [rows[0].id]);

    const { code, report } = await gate1();

    expect(code).toBe(1);
    expect(countries(report).count.pass).toBe(false);
    expect(countries(report).count.staging).toBe(countries(report).count.source - 1);
  });

  it("content: fails and names the drifted row when a value is mutated in staging", async () => {
    const { rows } = await client.query(`SELECT id FROM v1_staging.${TABLE} ORDER BY id LIMIT 1`);
    await client.query(`UPDATE v1_staging.${TABLE} SET name = name || ' (drifted)' WHERE id = $1`, [rows[0].id]);

    const { code, report } = await gate1();

    expect(code).toBe(1);
    // Counts still line up - only the content drifted, and the gate says so.
    expect(countries(report).count.pass).toBe(true);
    expect(countries(report).content.pass).toBe(false);
    expect(countries(report).content.differing).toBe(1);
    expect(countries(report).content.samples[0].columns).toContain("name");
  });

  it("fk: fails on an orphan under a foreign key reproduced from V1", async () => {
    // How a real broken extract looks: the constraint exists and the data
    // violates it. NOT VALID skips only the rows already there, so the orphan is
    // written first - the same order the loader achieves with
    // session_replication_role = replica.
    await client.query(`
      CREATE TABLE IF NOT EXISTS v1_staging.gate1_child (
        id integer PRIMARY KEY,
        country_id integer NOT NULL
      )`);
    await client.query(`INSERT INTO v1_staging.gate1_child (id, country_id) VALUES (1, 999999)
                        ON CONFLICT (id) DO UPDATE SET country_id = 999999`);
    await client.query(`
      ALTER TABLE v1_staging.gate1_child
        ADD CONSTRAINT gate1_child_country_fkey
        FOREIGN KEY (country_id) REFERENCES v1_staging.${TABLE}(id) NOT VALID`);

    const { code, report } = await gate1();

    expect(code).toBe(1);
    expect(report.fk.pass).toBe(false);
    expect(report.fk.violations[0]).toMatchObject({ constraint: "gate1_child_country_fkey", orphans: 1 });

    await client.query(`DROP TABLE v1_staging.gate1_child`);
  });

  it("sequence: fails when a staging sequence sits below max(pk)", async () => {
    // V1 is uuid-PK throughout, so the real staging schema has no sequences at
    // all. That makes check 4 vacuously green - which is exactly why it needs a
    // fixture that gives it something to fail on.
    await client.query(`CREATE TABLE IF NOT EXISTS v1_staging.gate1_serial (id serial PRIMARY KEY, v text)`);
    await client.query(`TRUNCATE v1_staging.gate1_serial RESTART IDENTITY`);
    await client.query(`INSERT INTO v1_staging.gate1_serial (v) SELECT 'x' FROM generate_series(1, 5)`);
    await client.query(`SELECT setval('v1_staging.gate1_serial_id_seq', 1, false)`);

    const { code, report } = await gate1();

    expect(code).toBe(1);
    expect(report.sequences.pass).toBe(false);
    expect(report.sequences.behind[0]).toMatchObject({ table: "gate1_serial", at: 0, maxPk: 5 });

    await client.query(`DROP TABLE v1_staging.gate1_serial`);
  });
});
