// GATE 3 — the read-parity gate, proven to FAIL.
//
// A gate nobody has watched fail is not a gate. Gates 1 and 2 each carry
// seeded-mismatch fixtures; this is Gate 3's. It stands up a miniature of the
// real thing — a tenant schema named by a raw UUID, a mig.* resolver mapping
// service id -> schema name, and a stub HTTP endpoint standing in for
// /api/v3/catalog/services — then damages it one way at a time and asserts the
// harness goes red on each:
//
//   1. drift        a source column mutated out from under the endpoint
//   2. missing      the source row deleted; the endpoint still serves the item
//   3. provenance   v1_id nulled — the row exists but is no longer migrated data
//   4. resolver     the mig entry removed; no tenant schema, so no trace
//   5. vacuous      the endpoint returns nothing (V2's harness would have passed)
//   6. brittle      a corpus that puts an exact count on a filtered endpoint
//
// …plus the rule that makes a green mean something: the undamaged fixture
// exits 0. Everything runs against the real CLI over a real Postgres, so what
// is proven here is the shipped code path, not a re-implementation of it.

import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
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
const HARNESS = path.join(BACKEND_ROOT, "scripts/migration/read-parity.mjs");

/** A raw-UUID tenant schema — the shape V3 actually uses, and the one that needs quoting. */
const TENANT = "0f0f0f0f-1111-4222-8333-444444444444";
const RESOLVER = "rp_fixture_map_services";

const SERVICES = [
  { id: "aaaaaaaa-0000-4000-8000-000000000001", v1: "11111111-0000-4000-8000-000000000001", name: "Bachelor of Fixtures", slug: "bachelor-of-fixtures" },
  { id: "aaaaaaaa-0000-4000-8000-000000000002", v1: "11111111-0000-4000-8000-000000000002", name: "Diploma of Fixtures", slug: "diploma-of-fixtures" },
];

interface Report {
  pass: boolean;
  failures: number;
  entries: { name: string; items: number; failures: string[] }[];
}

const describeDb = describe.skipIf(!dbAvailable);

describeDb("Gate 3 read parity", () => {
  const url = testDatabaseUrl();
  let client: pg.Client;
  let workDir: string;
  let server: Server;
  let apiUrl: string;
  /** What the stub endpoint serves. Tests reassign it to simulate a drifting read layer. */
  let served: Record<string, unknown>[] = [];

  async function start() {
    client = new pg.Client({ connectionString: url });
    await client.connect();
    workDir = await mkdtemp(path.join(tmpdir(), "read-parity-"));

    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: served }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    apiUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  }

  async function seed() {
    await client.query(`DROP SCHEMA IF EXISTS "${TENANT}" CASCADE`);
    await client.query(`CREATE SCHEMA "${TENANT}"`);
    await client.query(`CREATE SCHEMA IF NOT EXISTS mig`);
    await client.query(`DROP TABLE IF EXISTS mig.${RESOLVER}`);
    await client.query(`
      CREATE TABLE "${TENANT}".business_services (
        id uuid PRIMARY KEY, v1_id uuid, name text NOT NULL, slug text
      )`);
    await client.query(`CREATE TABLE mig.${RESOLVER} (id uuid PRIMARY KEY, schema_name text NOT NULL)`);
    for (const s of SERVICES) {
      await client.query(`INSERT INTO "${TENANT}".business_services (id, v1_id, name, slug) VALUES ($1,$2,$3,$4)`, [s.id, s.v1, s.name, s.slug]);
      await client.query(`INSERT INTO mig.${RESOLVER} (id, schema_name) VALUES ($1,$2)`, [s.id, TENANT]);
    }
    served = SERVICES.map((s) => ({ service_id: s.id, name: s.name, slug: s.slug }));
  }

  function corpus(overrides: Record<string, unknown> = {}) {
    return {
      entries: [
        {
          name: "fixture-catalog-services",
          path: "/api/v3/catalog/services",
          itemsPath: "data",
          filtered: true,
          idField: "service_id",
          trace: {
            schemaResolver: { table: `mig.${RESOLVER}`, idColumn: "id", schemaColumn: "schema_name" },
            table: "business_services",
            idColumn: "id",
            provenance: "v1_id",
          },
          compareFields: { name: "name", slug: "slug" },
          ...overrides,
        },
      ],
    };
  }

  async function run(corpusDoc: unknown, extraArgs: string[] = []): Promise<{ code: number; report: Report | null; stdout: string; stderr: string }> {
    const file = path.join(workDir, `corpus-${Math.random().toString(36).slice(2)}.json`);
    await writeFile(file, JSON.stringify(corpusDoc));
    const args = [HARNESS, "--run", "--json", `--corpus=${file}`, `--api-url=${apiUrl}`, `--target-url=${url}`, ...extraArgs];
    try {
      const { stdout, stderr } = await execFileAsync("node", args, { cwd: BACKEND_ROOT });
      return { code: 0, report: JSON.parse(stdout) as Report, stdout, stderr };
    } catch (err) {
      const e = err as { code?: number; stdout?: string; stderr?: string };
      let report: Report | null = null;
      try {
        report = JSON.parse(e.stdout ?? "") as Report;
      } catch {
        /* exit 2 paths print a plain message, not JSON */
      }
      return { code: e.code ?? 1, report, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
    }
  }

  const failures = (r: { report: Report | null }) => r.report?.entries[0]?.failures.join(" | ") ?? "";

  beforeEach(async () => {
    if (!client) await start();
    await seed();
  });

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS "${TENANT}" CASCADE`).catch(() => {});
      await client.query(`DROP TABLE IF EXISTS mig.${RESOLVER}`).catch(() => {});
      await client.end().catch(() => {});
    }
    server?.close();
  });

  it("is green on an undamaged fixture", async () => {
    const r = await run(corpus());
    expect(r.report?.pass, r.stdout).toBe(true);
    expect(r.code).toBe(0);
    expect(r.report?.entries[0].items).toBe(2);
  });

  it("goes red when a migrated source row drifts from what the endpoint serves", async () => {
    await client.query(`UPDATE "${TENANT}".business_services SET name = 'Renamed Behind The Endpoint' WHERE id = $1`, [SERVICES[0].id]);
    const r = await run(corpus());
    expect(r.code).toBe(1);
    expect(failures(r)).toMatch(/1 item\(s\) drift from source/);
    expect(failures(r)).toContain(SERVICES[0].id);
    expect(failures(r)).toContain("name");
  });

  it("goes red when the endpoint serves an item with no source row at all", async () => {
    await client.query(`DELETE FROM "${TENANT}".business_services WHERE id = $1`, [SERVICES[1].id]);
    const r = await run(corpus());
    expect(r.code).toBe(1);
    expect(failures(r)).toMatch(/1 item\(s\) absent from/);
  });

  it("goes red when the source row exists but is not migrated data", async () => {
    await client.query(`UPDATE "${TENANT}".business_services SET v1_id = NULL WHERE id = $1`, [SERVICES[0].id]);
    const r = await run(corpus());
    expect(r.code).toBe(1);
    expect(failures(r)).toMatch(/1 item\(s\) trace to a row with no provenance/);
  });

  it("goes red when the mig resolver cannot name the tenant schema", async () => {
    await client.query(`DELETE FROM mig.${RESOLVER} WHERE id = $1`, [SERVICES[0].id]);
    const r = await run(corpus());
    expect(r.code).toBe(1);
    expect(failures(r)).toMatch(/1 item\(s\) have no mig\..* entry/);
  });

  it("goes red on an endpoint that returns nothing — a trace over nothing proves nothing", async () => {
    served = [];
    const r = await run(corpus());
    expect(r.code).toBe(1);
    expect(failures(r)).toMatch(/need >= 1/);
  });

  it("refuses a corpus that asserts an exact count on a filtered endpoint", async () => {
    const r = await run(corpus({ count: { sql: "SELECT 1" } }));
    expect(r.code).toBe(2);
    expect(r.stderr + r.stdout).toMatch(/exact counts are not allowed on a filtered/);
  });

  it("refuses a corpus that names a tenant schema instead of resolving it", async () => {
    const r = await run(corpus({ trace: { schema: TENANT, table: "business_services", idColumn: "id" } }));
    expect(r.code).toBe(2);
    expect(r.stderr + r.stdout).toMatch(/literal schema must be one of/);
  });

  it("passes its own --self-check over the shipped corpus", async () => {
    const { stdout } = await execFileAsync("node", [HARNESS, "--self-check"], { cwd: BACKEND_ROOT });
    expect(stdout).toMatch(/self-check: ok/);
  });
});
