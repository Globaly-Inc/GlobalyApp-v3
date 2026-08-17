// The migration parity gate, proven to FAIL.
//
// A verifier nobody has seen fail is worthless: it would report GREEN on a
// broken cutover. So this suite builds deliberately-broken fixtures and asserts
// that each of the four checks fires on its own kind of damage —
//
//   1. count     a row missing in the target
//   2. content   a mutated column value
//   3. fk        a child row whose parent was deleted
//   4. sequence  a sequence reset below max(pk)
//
// …plus the two rules that make a green trustworthy: a clean run exits 0, and a
// source column that the manifest neither maps nor declares dropped is an ERROR,
// not a pass. Self-parity (both URLs at the same database, the V2 trick) is the
// baseline: `vfx_tgt.orders` compared against itself must be green.
//
// The fixtures deliberately mirror the V1->V3 transform rather than an identical
// copy: uuid PK -> serial id with the uuid preserved in `v1_id`, and a renamed
// column (amount -> total). Both sides live in the test database, so the CLI is
// invoked with the same URL twice.

import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { dbAvailable } from "../helpers/db.js";
import { testDatabaseUrl } from "../setup/db-url.js";

const execFileAsync = promisify(execFile);
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VERIFIER = path.join(BACKEND_ROOT, "database/scripts/verify-migration.mjs");

const SRC = "vfx_src";
const TGT = "vfx_tgt";

/** Four orders; only ORDERS[3] is childless, so it is the one safe to delete. */
const ORDERS = [
  { uuid: "11111111-1111-4111-8111-111111111111", code: "AAA", amount: "10.50", note: "n1" },
  { uuid: "22222222-2222-4222-8222-222222222222", code: "BBB", amount: "20.00", note: "n2" },
  { uuid: "33333333-3333-4333-8333-333333333333", code: "CCC", amount: "30.25", note: "n3" },
  { uuid: "44444444-4444-4444-8444-444444444444", code: "DDD", amount: "40.00", note: null },
];

/**
 * A mapping-aware manifest over the fixtures. `dropped` covers every remaining
 * source column, so the coverage rule is satisfied — one test removes an entry
 * to prove the rule bites.
 */
function fixtureManifest(overrides: Record<string, unknown> = {}) {
  return {
    structural: { schemas: [TGT] },
    mappings: [
      {
        name: "orders",
        source: { table: `${SRC}.orders`, alias: "s", joins: [], filter: null },
        target: { table: `${TGT}.orders`, alias: "t", joins: [], filter: null },
        identity: { label: "fixture uuid", source: "s.id::text", target: "t.v1_id::text" },
        extraTargetRows: { policy: "fail" },
        columns: [
          { name: "code", from: "code", source: "s.code", target: "t.code" },
          // Renamed on the target: amount -> total.
          { name: "total", from: "amount", source: "s.amount::float8", target: "t.total::float8" },
        ],
        dropped: [
          { column: "id", reason: "It is the identity key, preserved as v1_id on the target." },
          { column: "note", reason: "Deliberately not migrated; there is no target column for it." },
          { column: "created_at", reason: "The target stamps its own timestamp at load time." },
        ],
        ...overrides,
      },
    ],
  };
}

/** The V2 self-parity trick, mapping-aware edition: the target against itself. */
function selfParityManifest() {
  return {
    structural: { schemas: [TGT] },
    mappings: [
      {
        name: "orders_self",
        source: { table: `${TGT}.orders`, alias: "s", joins: [], filter: null },
        target: { table: `${TGT}.orders`, alias: "t", joins: [], filter: null },
        identity: { label: "self", source: "s.v1_id::text", target: "t.v1_id::text" },
        extraTargetRows: { policy: "fail" },
        columns: [
          { name: "code", from: "code", source: "s.code", target: "t.code" },
          { name: "total", from: "total", source: "s.total::float8", target: "t.total::float8" },
        ],
        dropped: [
          { column: "id", reason: "Serial surrogate key; not a migrated value." },
          { column: "v1_id", reason: "It is the identity key." },
          { column: "created_at", reason: "Timestamp stamped at load time." },
        ],
      },
    ],
  };
}

interface Report {
  pass: boolean;
  failures: number;
  mappings: {
    name: string;
    checks: Record<string, any>;
  }[];
  fk: { pass: boolean; violationsTotal: number; violations: any[] };
  sequences: { pass: boolean; behindTotal: number; behind: any[] };
}

const describeDb = describe.skipIf(!dbAvailable);

describeDb("migration parity gate", () => {
  const url = testDatabaseUrl();
  let client: pg.Client;
  let workDir: string;

  async function runVerifier(
    manifest: unknown,
    extraArgs: string[] = [],
  ): Promise<{ code: number; report: Report; stdout: string }> {
    const manifestPath = path.join(workDir, `manifest-${Math.random().toString(36).slice(2)}.json`);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    const args = [
      VERIFIER,
      "--json",
      `--manifest=${manifestPath}`,
      `--source-url=${url}`,
      `--target-url=${url}`,
      ...extraArgs,
    ];
    try {
      const { stdout } = await execFileAsync(process.execPath, args, { cwd: BACKEND_ROOT });
      return { code: 0, report: JSON.parse(stdout) as Report, stdout };
    } catch (err) {
      const e = err as { code?: number; stdout?: string; stderr?: string };
      const code = typeof e.code === "number" ? e.code : 1;
      // Exit 2 (usage/manifest error) prints to stderr and emits no JSON.
      const report = code === 1 ? (JSON.parse(e.stdout ?? "{}") as Report) : ({} as Report);
      return { code, report, stdout: `${e.stdout ?? ""}${e.stderr ?? ""}` };
    }
  }

  const orders = (r: Report) => r.mappings[0].checks;

  beforeEach(async () => {
    if (!workDir) workDir = await mkdtemp(path.join(tmpdir(), "verify-migration-"));
    if (!client) {
      client = new pg.Client({ connectionString: url });
      await client.connect();
    }

    // Rebuild from scratch every test so one case's damage cannot leak into the next.
    await client.query(`DROP SCHEMA IF EXISTS ${SRC} CASCADE; DROP SCHEMA IF EXISTS ${TGT} CASCADE`);
    await client.query(`CREATE SCHEMA ${SRC}; CREATE SCHEMA ${TGT}`);

    await client.query(`
      CREATE TABLE ${SRC}.orders (
        id uuid PRIMARY KEY,
        code text NOT NULL,
        amount numeric NOT NULL,
        note text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await client.query(`
      CREATE TABLE ${TGT}.orders (
        id serial PRIMARY KEY,
        v1_id uuid NOT NULL UNIQUE,
        code text NOT NULL,
        total numeric NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await client.query(`
      CREATE TABLE ${TGT}.order_lines (
        id serial PRIMARY KEY,
        order_id integer NOT NULL REFERENCES ${TGT}.orders(id),
        qty integer NOT NULL
      )`);

    for (const o of ORDERS) {
      await client.query(`INSERT INTO ${SRC}.orders (id, code, amount, note) VALUES ($1,$2,$3,$4)`, [
        o.uuid,
        o.code,
        o.amount,
        o.note,
      ]);
      await client.query(`INSERT INTO ${TGT}.orders (v1_id, code, total) VALUES ($1,$2,$3)`, [
        o.uuid,
        o.code,
        o.amount,
      ]);
    }
    // Children for the first three orders; ORDERS[3] stays childless.
    await client.query(`
      INSERT INTO ${TGT}.order_lines (order_id, qty)
      SELECT id, 1 FROM ${TGT}.orders WHERE v1_id <> $1`, [ORDERS[3].uuid]);
  });

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS ${SRC} CASCADE; DROP SCHEMA IF EXISTS ${TGT} CASCADE`);
      await client.end();
    }
  });

  // ── The baseline: green must be reachable ─────────────────────────────────

  it("exits 0 on clean, correctly-transformed data", async () => {
    const { code, report } = await runVerifier(fixtureManifest());

    expect(code).toBe(0);
    expect(report.pass).toBe(true);
    expect(report.failures).toBe(0);
    expect(orders(report).count).toMatchObject({ pass: true, sourceRows: 4, targetRows: 4, matched: 4 });
    expect(orders(report).content).toMatchObject({ pass: true, comparedRows: 4, differingRows: 0 });
    expect(report.fk.pass).toBe(true);
    expect(report.sequences.pass).toBe(true);
  });

  it("exits 0 on self-parity — the target compared against itself", async () => {
    const { code, report } = await runVerifier(selfParityManifest());

    expect(code).toBe(0);
    expect(report.pass).toBe(true);
    expect(orders(report).content).toMatchObject({ pass: true, comparedRows: 4, differingRows: 0 });
  });

  // ── Check 1: count ────────────────────────────────────────────────────────

  it("check 1 (count): fails and names the row when one is missing in the target", async () => {
    await client.query(`DELETE FROM ${TGT}.orders WHERE v1_id = $1`, [ORDERS[3].uuid]);

    const { code, report } = await runVerifier(fixtureManifest());

    expect(code).toBe(1);
    expect(report.pass).toBe(false);
    expect(orders(report).count).toMatchObject({
      pass: false,
      sourceRows: 4,
      targetRows: 3,
      matched: 3,
      missingTotal: 1,
      missing: [ORDERS[3].uuid],
    });
    // The surviving rows still compare clean — the failure is localised.
    expect(orders(report).content).toMatchObject({ pass: true, comparedRows: 3 });
  });

  it("check 1 (count): fails on an unexplained extra target row under the default policy", async () => {
    await client.query(`INSERT INTO ${TGT}.orders (v1_id, code, total) VALUES (gen_random_uuid(), 'EEE', 1)`);

    const { code, report } = await runVerifier(fixtureManifest());

    expect(code).toBe(1);
    expect(orders(report).count).toMatchObject({ pass: false, extraTotal: 1, targetRows: 5 });
  });

  it("check 1 (count): an extra target row inside a declared, capped allowance stays green", async () => {
    await client.query(`INSERT INTO ${TGT}.orders (v1_id, code, total) VALUES (gen_random_uuid(), 'EEE', 1)`);

    const { code, report } = await runVerifier(
      fixtureManifest({
        extraTargetRows: { policy: "allow", max: 1, reason: "one target-native row is expected here" },
      }),
    );

    expect(code).toBe(0);
    // Allowed, but still reported — an allowance is never a silent skip.
    expect(orders(report).count).toMatchObject({ pass: true, extraTotal: 1 });
    expect(orders(report).count.extra).toHaveLength(1);
  });

  // ── Check 2: content ──────────────────────────────────────────────────────

  it("check 2 (content): fails and names column / expected / actual on a mutated value", async () => {
    await client.query(`UPDATE ${TGT}.orders SET code = 'CORRUPT' WHERE v1_id = $1`, [ORDERS[1].uuid]);

    const { code, report } = await runVerifier(fixtureManifest());

    expect(code).toBe(1);
    expect(orders(report).count.pass).toBe(true); // counts still line up — only content drifted
    expect(orders(report).content).toMatchObject({ pass: false, comparedRows: 4, differingRows: 1 });
    expect(orders(report).content.samples).toEqual([
      { key: ORDERS[1].uuid, columns: [{ column: "code", expected: "BBB", actual: "CORRUPT" }] },
    ]);
  });

  it("check 2 (content): catches drift in a RENAMED column (amount -> total)", async () => {
    await client.query(`UPDATE ${TGT}.orders SET total = total + 1 WHERE v1_id = $1`, [ORDERS[0].uuid]);

    const { code, report } = await runVerifier(fixtureManifest());

    expect(code).toBe(1);
    expect(orders(report).content.samples[0]).toMatchObject({
      key: ORDERS[0].uuid,
      columns: [{ column: "total", expected: 10.5, actual: 11.5 }],
    });
  });

  it("check 2 (content): a pure representation difference is NOT a mismatch", async () => {
    // Same number, different scale on the target ("10.50" vs "10.500000").
    await client.query(`UPDATE ${TGT}.orders SET total = 10.500000 WHERE v1_id = $1`, [ORDERS[0].uuid]);

    const { code, report } = await runVerifier(fixtureManifest());

    expect(code).toBe(0);
    expect(orders(report).content).toMatchObject({ pass: true, differingRows: 0 });
  });

  // ── Check 3: FK orphans ───────────────────────────────────────────────────

  it("check 3 (fk): fails when a child points at a parent that is gone", async () => {
    // How a real broken load looks: the constraint exists, the data violates it.
    await client.query(`ALTER TABLE ${TGT}.order_lines DROP CONSTRAINT order_lines_order_id_fkey`);
    await client.query(`INSERT INTO ${TGT}.order_lines (order_id, qty) VALUES (999999, 7)`);
    await client.query(
      `ALTER TABLE ${TGT}.order_lines
         ADD CONSTRAINT order_lines_order_id_fkey
         FOREIGN KEY (order_id) REFERENCES ${TGT}.orders(id) NOT VALID`,
    );

    const { code, report } = await runVerifier(fixtureManifest());

    expect(code).toBe(1);
    expect(report.fk.pass).toBe(false);
    expect(report.fk.violationsTotal).toBe(1);
    expect(report.fk.violations[0]).toMatchObject({
      constraint: "order_lines_order_id_fkey",
      child: `${TGT}.order_lines`,
      parent: `${TGT}.orders`,
      orphans: 1,
    });
    // The row checks are unaffected — the report pinpoints the structural damage.
    expect(orders(report).count.pass).toBe(true);
    expect(orders(report).content.pass).toBe(true);
  });

  // ── Check 4: sequence health ──────────────────────────────────────────────

  it("check 4 (sequence): fails when a sequence sits below max(pk)", async () => {
    await client.query(`SELECT setval('${TGT}.orders_id_seq', 1, false)`);

    const { code, report } = await runVerifier(fixtureManifest());

    expect(code).toBe(1);
    expect(report.sequences.pass).toBe(false);
    expect(report.sequences.behindTotal).toBe(1);
    expect(report.sequences.behind[0]).toMatchObject({
      table: `${TGT}.orders`,
      column: "id",
      sequenceAt: 0,
      maxPk: 4,
    });
    expect(orders(report).count.pass).toBe(true);
    expect(orders(report).content.pass).toBe(true);
  });

  it("check 4 (sequence): a never-used sequence on an empty table is fine", async () => {
    await client.query(`CREATE TABLE ${TGT}.empty_thing (id serial PRIMARY KEY)`);

    const { code, report } = await runVerifier(fixtureManifest());

    expect(code).toBe(0);
    expect(report.sequences.pass).toBe(true);
  });

  // ── The rule that keeps a green honest ────────────────────────────────────

  it("treats an unmapped, undeclared source column as an ERROR, not a pass", async () => {
    const manifest = fixtureManifest();
    // `note` is a real source column. Removing its `dropped` entry must not be
    // silently tolerated — a silent skip is data loss.
    manifest.mappings[0].dropped = manifest.mappings[0].dropped.filter((d) => d.column !== "note");

    const { code, report } = await runVerifier(manifest);

    expect(code).toBe(1);
    expect(orders(report).coverage.pass).toBe(false);
    expect(orders(report).coverage.problems.join("\n")).toContain(`${SRC}.orders.note`);
  });

  it("rejects a manifest naming a source column that does not exist", async () => {
    const manifest = fixtureManifest();
    manifest.mappings[0].dropped.push({ column: "ghost", reason: "this column was never real" });

    const { code, report } = await runVerifier(manifest);

    expect(code).toBe(1);
    expect(orders(report).coverage.problems.join("\n")).toContain("ghost");
  });

  // ── CLI contract ──────────────────────────────────────────────────────────

  it("--table selects a single mapping and rejects an unknown name", async () => {
    const both = {
      ...fixtureManifest(),
      mappings: [...fixtureManifest().mappings, { ...selfParityManifest().mappings[0] }],
    };

    const selected = await runVerifier(both, ["--table=orders_self"]);
    expect(selected.code).toBe(0);
    expect(selected.report.mappings).toHaveLength(1);
    expect(selected.report.mappings[0].name).toBe("orders_self");

    const unknown = await runVerifier(both, ["--table=nope"]);
    expect(unknown.code).toBe(2);
    expect(unknown.stdout).toContain("no mapping named");
  });

  it("--self-check validates the shipped manifest without touching a database", async () => {
    const { stdout } = await execFileAsync(process.execPath, [VERIFIER, "--self-check"], {
      cwd: BACKEND_ROOT,
      env: { ...process.env, V1_DATABASE_URL: "", V3_DATABASE_URL: "" },
    });
    expect(stdout).toContain("self-check: ok");
  });
});
