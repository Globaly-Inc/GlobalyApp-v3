// The Stage-2 transform runner (scripts/migration/lib.ts).
//
// Four properties this suite exists to hold down, because each of them is a way
// a migration goes wrong quietly:
//
//   dry-run <=> apply   the two must execute the IDENTICAL statements and differ
//                       only in ROLLBACK vs COMMIT. A dry run that takes another
//                       branch is a second, untested program wearing a rehearsal's
//                       name.
//   reason codes        an unresolved row can only be recorded with a reason from
//                       mapping.json's closed enum. The runner refuses to create
//                       the unexplained skip that Gate 2 check 6 would fail on.
//   junction guard      a junction refuses to load until every declared parent
//                       reconciles (defect D8).
//   resolver maps       mig.map_* actually resolve against the real V3 schema.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  MIG_SCHEMA,
  MigrationError,
  buildUpsert,
  chunk,
  dnsLabel,
  ensureMigSchema,
  intersectColumns,
  normalizeCountryKey,
  normalizeEmail,
  parseRunnerArgs,
  reasonCodes,
  reportUnresolved,
  runTransform,
  selfCheck,
  splitName,
  tableColumns,
  unmappedColumns,
  upsertRows,
  assertParentCounts,
} from "../../scripts/migration/lib.js";
import { dbAvailable } from "../helpers/db.js";
import { testDatabaseUrl } from "../setup/db-url.js";

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MAPPING = JSON.parse(readFileSync(path.join(BACKEND_ROOT, "scripts/migration/mapping.json"), "utf8"));
const CODES = reasonCodes(MAPPING);

const SCHEMA = "mrx";
const TARGET = `"${SCHEMA}"."widgets"`;

describe("transform runner - pure helpers", () => {
  it("--self-check asserts every pure helper", () => {
    expect(() => selfCheck()).not.toThrow();
  });

  it("dry run is the default; --apply is the only thing that commits", () => {
    expect(parseRunnerArgs([]).apply).toBe(false);
    expect(parseRunnerArgs(["--apply"]).apply).toBe(true);
    expect(() => parseRunnerArgs(["--typo"])).toThrow(MigrationError);
  });

  it("normalizes the identity and geography keys the resolvers join on", () => {
    expect(normalizeEmail(" A@B.COM ")).toBe("a@b.com");
    expect(normalizeEmail("nope")).toBeNull();
    expect(splitName("Amit Ranjit Kar")).toEqual({ first: "Amit Ranjit", last: "Kar" });
    // Defect D7: the country drift that is actually in V1.
    expect(normalizeCountryKey("INDIA")).toBe(normalizeCountryKey(" india "));
    expect(normalizeCountryKey("VIET NAM")).toBe(normalizeCountryKey("Viet Nam"));
    expect(dnsLabel("Asia Pacific International College")).toBe("asia-pacific-international-college");
    expect(dnsLabel("!!!")).toBeNull();
  });

  it("discovers the column set instead of declaring it, and reports the leftovers", () => {
    const target = new Set(["a", "b"]);
    expect(intersectColumns(["b", "a", "c"], target)).toEqual(["a", "b"]);
    expect(unmappedColumns(["b", "c"], target)).toEqual(["c"]);
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  it("refuses an upsert that is not idempotent", () => {
    expect(buildUpsert('"t"', ["k", "v"], ["k"], 1)).toContain('ON CONFLICT ("k") DO UPDATE SET "v"');
    expect(() => buildUpsert('"t"', ["k"], [], 1)).toThrow(/not idempotent/);
  });

  it("the reason enum is closed and comes from mapping.json", () => {
    expect(CODES.size).toBeGreaterThanOrEqual(10);
    expect(CODES.has("unresolved_business")).toBe(true);
    expect(CODES.has("$comment")).toBe(false);
  });
});

const describeDb = describe.skipIf(!dbAvailable);

describeDb("transform runner - against the database", () => {
  const url = testDatabaseUrl();
  let client: pg.Client;

  beforeEach(async () => {
    if (!client) {
      client = new pg.Client({ connectionString: url });
      await client.connect();
    }
    await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await client.query(`CREATE SCHEMA ${SCHEMA}`);
    await client.query(`CREATE TABLE ${SCHEMA}.widgets (code text PRIMARY KEY, label text NOT NULL)`);
    await client.query(`CREATE SCHEMA IF NOT EXISTS v1_staging`);
    await client.query(`CREATE TABLE IF NOT EXISTS v1_staging.mrx_parent (id uuid PRIMARY KEY)`);
    await client.query(`TRUNCATE v1_staging.mrx_parent`);
    await client.query(`
      DO $$ BEGIN
        IF to_regclass('${MIG_SCHEMA}.unresolved') IS NOT NULL THEN
          DELETE FROM ${MIG_SCHEMA}.unresolved WHERE wave LIKE 'MRX%';
        END IF;
      END $$`);
  });

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      await client.query(`DROP TABLE IF EXISTS v1_staging.mrx_parent`);
      await client.end();
    }
  });

  const rows = [
    { code: "a", label: "Alpha" },
    { code: "b", label: "Bravo" },
  ];

  const writeWidgets = async (ctx: Parameters<Parameters<typeof runTransform>[0]["body"]>[0]) => {
    await upsertRows(ctx, TARGET, ["code", "label"], rows, ["code"]);
  };

  const widgetCount = async () => Number((await client.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.widgets`)).rows[0].n);

  // -- dry-run <=> apply equivalence ---------------------------------------

  it("a dry run executes the same statements and commits nothing", async () => {
    const dry = await runTransform({ wave: "MRX", argv: [`--url=${url}`], body: writeWidgets });

    expect(dry).toBe(0);
    // The write happened inside the transaction - the report proves the code path
    // ran - and then the transaction was rolled back.
    expect(await widgetCount()).toBe(0);
  });

  it("--apply commits, and re-running converges instead of duplicating", async () => {
    expect(await runTransform({ wave: "MRX", argv: [`--url=${url}`, "--apply"], body: writeWidgets })).toBe(0);
    expect(await widgetCount()).toBe(2);

    // Idempotent by construction: same natural key, second run is a no-op.
    expect(await runTransform({ wave: "MRX", argv: [`--url=${url}`, "--apply"], body: writeWidgets })).toBe(0);
    expect(await widgetCount()).toBe(2);

    // ...and it converges rather than ignoring: a changed label is refreshed.
    await client.query(`UPDATE ${SCHEMA}.widgets SET label = 'STALE' WHERE code = 'a'`);
    await runTransform({ wave: "MRX", argv: [`--url=${url}`, "--apply"], body: writeWidgets });
    const { rows: after } = await client.query(`SELECT label FROM ${SCHEMA}.widgets WHERE code = 'a'`);
    expect(after[0].label).toBe("Alpha");
  });

  it("dry run and apply produce the identical report", async () => {
    const captured: Record<string, unknown>[] = [];
    const body = async (ctx: Parameters<Parameters<typeof runTransform>[0]["body"]>[0]) => {
      await writeWidgets(ctx);
      captured.push({ ...ctx.report.written });
    };

    await runTransform({ wave: "MRX", argv: [`--url=${url}`], body });
    await runTransform({ wave: "MRX", argv: [`--url=${url}`, "--apply"], body });

    expect(captured).toHaveLength(2);
    expect(captured[0]).toEqual(captured[1]);
  });

  it("rolls back everything when the body throws", async () => {
    const code = await runTransform({
      wave: "MRX",
      argv: [`--url=${url}`, "--apply"],
      body: async (ctx) => {
        await writeWidgets(ctx);
        throw new MigrationError("boom");
      },
    });

    expect(code).toBe(1);
    expect(await widgetCount()).toBe(0);
  });

  // -- the reason-coded report ---------------------------------------------

  it("records an unresolved row with a reason from the closed enum", async () => {
    await runTransform({
      wave: "MRX-report",
      argv: [`--url=${url}`, "--apply"],
      body: async (ctx, codes) => {
        await reportUnresolved(
          ctx,
          { sourceTable: "mrx_parent", sourceKey: "k1", reasonCode: "unresolved_business", detail: "no businesses row" },
          codes,
        );
      },
    });

    const { rows: report } = await client.query(
      `SELECT source_table, source_key, reason_code FROM ${MIG_SCHEMA}.unresolved WHERE wave = 'MRX-report'`,
    );
    expect(report).toEqual([{ source_table: "mrx_parent", source_key: "k1", reason_code: "unresolved_business" }]);
  });

  it("refuses an unknown reason code - the runner cannot create an unexplained skip", async () => {
    const code = await runTransform({
      wave: "MRX-bad",
      argv: [`--url=${url}`, "--apply"],
      body: async (ctx, codes) => {
        await reportUnresolved(ctx, { sourceTable: "mrx_parent", sourceKey: "k1", reasonCode: "because_reasons" }, codes);
      },
    });

    expect(code).toBe(1);
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${MIG_SCHEMA}.unresolved WHERE wave = 'MRX-bad'`);
    expect(rows[0].n).toBe(0);
  });

  // -- defect D8: the junction parent guard --------------------------------

  it("a junction loads when its parents reconcile", async () => {
    await client.query(`INSERT INTO v1_staging.mrx_parent (id) VALUES (gen_random_uuid()), (gen_random_uuid())`);
    await client.query(`INSERT INTO ${SCHEMA}.widgets (code, label) VALUES ('a','A'), ('b','B')`);

    const code = await runTransform({
      wave: "MRX-junction",
      argv: [`--url=${url}`, "--apply"],
      body: async (ctx) => {
        await assertParentCounts(ctx, "widget_links", [
          { label: "widgets", stagingTable: "mrx_parent", targetTable: `${SCHEMA}.widgets` },
        ]);
      },
    });

    expect(code).toBe(0);
  });

  it("a junction REFUSES to load over a parent that did not reconcile", async () => {
    await client.query(`INSERT INTO v1_staging.mrx_parent (id) SELECT gen_random_uuid() FROM generate_series(1, 5)`);
    await client.query(`INSERT INTO ${SCHEMA}.widgets (code, label) VALUES ('a','A')`);

    const code = await runTransform({
      wave: "MRX-junction",
      argv: [`--url=${url}`, "--apply"],
      body: async (ctx) => {
        await assertParentCounts(ctx, "widget_links", [
          { label: "widgets", stagingTable: "mrx_parent", targetTable: `${SCHEMA}.widgets` },
        ]);
        await upsertRows(ctx, TARGET, ["code", "label"], [{ code: "z", label: "Zulu" }], ["code"]);
      },
    });

    expect(code).toBe(1);
    // Nothing was written - the guard fired before the insert, and the whole
    // transaction rolled back.
    expect(await widgetCount()).toBe(1);
  });

  it("a parent shortfall that the report EXPLAINS is not a failure", async () => {
    await client.query(`INSERT INTO v1_staging.mrx_parent (id) SELECT gen_random_uuid() FROM generate_series(1, 3)`);
    await client.query(`INSERT INTO ${SCHEMA}.widgets (code, label) VALUES ('a','A'), ('b','B')`);

    const code = await runTransform({
      wave: "MRX-junction",
      argv: [`--url=${url}`, "--apply"],
      body: async (ctx, codes) => {
        await reportUnresolved(ctx, { sourceTable: "mrx_parent", sourceKey: "k3", reasonCode: "unresolved_user" }, codes);
        await assertParentCounts(ctx, "widget_links", [
          { label: "widgets", stagingTable: "mrx_parent", targetTable: `${SCHEMA}.widgets` },
        ]);
      },
    });

    expect(code).toBe(0);
  });

  // -- the mig schema -------------------------------------------------------

  it("ensureMigSchema creates the report table and every resolver map", async () => {
    const created = await ensureMigSchema(client);

    expect(created).toContain(`${MIG_SCHEMA}.unresolved`);
    expect(created).toContain(`${MIG_SCHEMA}.map_businesses`);
    expect(created).toContain(`${MIG_SCHEMA}.map_institutions`);
    expect(created).toContain(`${MIG_SCHEMA}.map_countries`);
    expect(created).toContain(`${MIG_SCHEMA}.map_cities`);

    // Every view must be queryable, not merely created.
    for (const view of ["map_businesses", "map_institutions", "map_countries", "map_cities"]) {
      await expect(client.query(`SELECT * FROM ${MIG_SCHEMA}.${view} LIMIT 1`)).resolves.toBeDefined();
    }
  });

  it("map_countries resolves ISO-2, ISO-3 and the country name to one id", async () => {
    await ensureMigSchema(client);
    const { rows: country } = await client.query(
      `SELECT id, iso2, iso3, name FROM public.countries WHERE iso2 IS NOT NULL AND iso3 IS NOT NULL LIMIT 1`,
    );
    if (country.length === 0) return; // no reference data seeded in this database

    const keys = [country[0].iso2, country[0].iso3, country[0].name].map((v) => normalizeCountryKey(v));
    const { rows: resolved } = await client.query(
      `SELECT DISTINCT id FROM ${MIG_SCHEMA}.map_countries WHERE key = ANY($1)`,
      [keys],
    );
    expect(resolved).toEqual([{ id: country[0].id }]);
  });

  it("tableColumns introspects rather than trusting a hardcoded list", async () => {
    const cols = await tableColumns(client, SCHEMA, "widgets");
    expect([...cols].sort()).toEqual(["code", "label"]);
    await expect(tableColumns(client, SCHEMA, "nope")).rejects.toThrow(/does not exist/);
  });
});
