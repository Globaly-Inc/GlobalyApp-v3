// W6 — the URL rewrite against a real Postgres.
//
// The unit suite proves the JS rewriter. It cannot prove the SQL one, and the SQL
// one is what actually touches the data: Postgres' ARE is not JavaScript's regex
// engine, a bracket expression with a doubled quote in it is a SQL-literal
// question, and `regexp_replace` on a jsonb cast either preserves the document or
// silently mangles it. All three are only answerable by running it.
//
// So this suite runs the real statements over a fixture that carries every shape
// the sweep can hand them — text, varchar, jsonb, text[] — plus the three values
// that must survive untouched: an external URL, a URL in a bucket W6 does not
// migrate, and a key the rewrite already produced.
//
// The fixture lives in its own schema so the sweep finds it exactly the way it
// finds a real column: by type and by content, not because the test named it.

import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { RunReport, TransformContext } from "../../scripts/migration/lib.js";
import { toStorageKey, v1StoragePathSql } from "../../scripts/migration/w6-storage-map.js";
import type { ColumnRef } from "../../scripts/migration/w6-storage-sweep.js";
import { buildInventory, rewriteStatement } from "../../scripts/migration/w6-storage.js";
import { dbAvailable } from "../helpers/db.js";
import { testDatabaseUrl } from "../setup/db-url.js";

const SCHEMA = "w6_fixture";
const V1 = "https://irhwtbyvrbaublgxvpfp.supabase.co/storage/v1/object/public";

/** Real V1 values, including the ones that must NOT change. */
const LOGO = `${V1}/business-assets/test-logos/LSAT.png?v=3`;
const AVATAR = `${V1}/avatars/covers/a821aff9-eedb-47f4-95d3-f30fa932505b/1775109918110.png`;
const GALLERY_A = `${V1}/business-assets/countries/1774517422654-bs1tzwlfebv.webp`;
const GALLERY_B = `${V1}/service-media/countries/1773605397659-95le0qteq14.jpg`;
const DROPPED = `${V1}/ambassador-media/never/migrated.png`;
const EXTERNAL = "https://images.pexels.com/photos/4103247/pexels-photo.jpeg?auto=compress&cs=tinysrgb";

const ref = (column: string, udt: string): ColumnRef => ({ schema: SCHEMA, table: "assets", column, udt });

const COLUMNS: ColumnRef[] = [
  ref("logo_url", "text"),
  ref("short_url", "varchar"),
  ref("gallery", "jsonb"),
  ref("images", "_text"),
];

describe.skipIf(!dbAvailable)("W6 URL rewrite (real SQL)", () => {
  let db: pg.Client;

  const ctx = (): TransformContext => {
    const report: RunReport = { runId: "w6-test", wave: "W6-test", apply: false, written: {}, unresolved: [], notes: [] };
    return { db, apply: false, wave: "W6-test", runId: "w6-test", batchSize: 500, report };
  };

  beforeAll(async () => {
    db = new pg.Client({ connectionString: testDatabaseUrl() });
    await db.connect();

    // buildInventory scans EVERY schema and every text-ish column, because a V1
    // storage URL can hide in any of them — that breadth is the point of the sweep.
    // A full suite run provisions ~516 tenant schemas (~52,000 columns), which took
    // this one test from 1.5s to a 30s timeout and read as a code failure on a file
    // no branch had touched. Tenant provisioning never drops its schema.
    //
    // Dropping them here rather than raising the timeout keeps the assertion honest:
    // the test is about what the inventory FINDS, and hiding a 20x slowdown behind a
    // bigger number would have thrown away the signal. Safe because the integration
    // project runs files serially (fileParallelism: false), so no other file owns
    // these, and the UUID pattern cannot match public/superadmin/mig/v1_staging.
    const { rows } = await db.query<{ schema_name: string }>(
      `SELECT schema_name FROM information_schema.schemata
        WHERE schema_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`,
    );
    for (const { schema_name } of rows) {
      await db.query(`DROP SCHEMA IF EXISTS "${schema_name}" CASCADE`).catch(() => {});
    }
  });

  afterAll(async () => {
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => {});
    await db.end().catch(() => {});
  });

  beforeEach(async () => {
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await db.query(`CREATE SCHEMA ${SCHEMA}`);
    await db.query(
      `CREATE TABLE ${SCHEMA}.assets (
         id        serial PRIMARY KEY,
         logo_url  text,
         short_url varchar(500),
         gallery   jsonb,
         images    text[]
       )`,
    );
    await db.query(
      `INSERT INTO ${SCHEMA}.assets (logo_url, short_url, gallery, images) VALUES
         ($1, $2, $3::jsonb, $4::text[]),
         ($5, $6, $7::jsonb, $8::text[])`,
      [
        LOGO,
        AVATAR,
        JSON.stringify([
          { url: GALLERY_A, type: "image", fileName: "a.webp" },
          { url: GALLERY_B, type: "image", fileName: "b.jpg" },
        ]),
        [AVATAR, EXTERNAL],
        // Row 2 is the "must not change" row.
        EXTERNAL,
        DROPPED,
        JSON.stringify({ hero: EXTERNAL, nested: { also: DROPPED } }),
        ["v1/avatars/already/rewritten.png", EXTERNAL],
      ],
    );
  });

  const rewriteAll = async (): Promise<Record<string, number>> => {
    const counts: Record<string, number> = {};
    for (const c of COLUMNS) counts[c.column] = (await db.query(rewriteStatement(c))).rowCount ?? 0;
    return counts;
  };

  it("reduces every rehostable URL to its GCS key, whatever the column type", async () => {
    await rewriteAll();
    const { rows } = await db.query(`SELECT * FROM ${SCHEMA}.assets ORDER BY id`);

    // text — and the cache-buster is gone, so this object has ONE key.
    expect(rows[0].logo_url).toBe("v1/business-assets/test-logos/LSAT.png");
    // varchar — regexp_replace returns text; the column must still accept it.
    expect(rows[0].short_url).toBe("v1/avatars/covers/a821aff9-eedb-47f4-95d3-f30fa932505b/1775109918110.png");
    // jsonb — rewritten, and still an array of objects with its keys intact.
    expect(rows[0].gallery).toEqual([
      { url: "v1/business-assets/countries/1774517422654-bs1tzwlfebv.webp", type: "image", fileName: "a.webp" },
      { url: "v1/service-media/countries/1773605397659-95le0qteq14.jpg", type: "image", fileName: "b.jpg" },
    ]);
    // text[] — element-wise, order preserved, non-matching element untouched.
    expect(rows[0].images).toEqual([
      "v1/avatars/covers/a821aff9-eedb-47f4-95d3-f30fa932505b/1775109918110.png",
      EXTERNAL,
    ]);
  });

  it("leaves alone what it must not touch", async () => {
    await rewriteAll();
    const { rows } = await db.query(`SELECT * FROM ${SCHEMA}.assets ORDER BY id`);
    // An external image URL is not a V1 object.
    expect(rows[1].logo_url).toBe(EXTERNAL);
    // A bucket W6 does not migrate: rewriting it would name an object that is
    // never going to be uploaded. It stays, and the wave reports it.
    expect(rows[1].short_url).toBe(DROPPED);
    expect(rows[1].gallery).toEqual({ hero: EXTERNAL, nested: { also: DROPPED } });
    // A key an earlier run already produced.
    expect(rows[1].images).toEqual(["v1/avatars/already/rewritten.png", EXTERNAL]);
  });

  it("is idempotent: the second run touches zero rows", async () => {
    const first = await rewriteAll();
    expect(first).toEqual({ logo_url: 1, short_url: 1, gallery: 1, images: 1 });

    const before = await db.query(`SELECT * FROM ${SCHEMA}.assets ORDER BY id`);
    const second = await rewriteAll();
    // Not "wrote the same value again" — did not fire at all. That is what makes
    // an interrupted cutover safe to re-run, and it is only observable in the
    // counts if the UPDATE is guarded on the rehostable pattern.
    expect(second).toEqual({ logo_url: 0, short_url: 0, gallery: 0, images: 0 });
    const after = await db.query(`SELECT * FROM ${SCHEMA}.assets ORDER BY id`);
    expect(after.rows).toEqual(before.rows);
  });

  it("the SQL rewriter and the JS one agree on every shape", async () => {
    // Two implementations of one function is how a migration develops a quiet
    // disagreement — and the copy half uses the JS one to decide where to upload.
    const urls = [LOGO, AVATAR, GALLERY_A, GALLERY_B, DROPPED, EXTERNAL, "v1/avatars/already/rewritten.png"];
    const { rows } = await db.query<{ url: string; key: string }>(
      `SELECT u AS url, ${v1StoragePathSql("u")} AS key FROM unnest($1::text[]) AS u`,
      [urls],
    );
    for (const r of rows) {
      const sql = r.key === r.url ? null : r.key;
      expect(sql, `SQL and JS disagree on ${r.url}`).toBe(toStorageKey(r.url));
    }
  });

  it("the inventory finds the fixture by content, not because it was named", async () => {
    const found = await buildInventory(ctx());
    const mine = found.filter((e) => e.schema === SCHEMA);
    expect(mine.map((e) => e.column).sort()).toEqual(["gallery", "images", "logo_url", "short_url"]);

    const logo = mine.find((e) => e.column === "logo_url")!;
    expect(logo.udt).toBe("text");
    expect(logo.rows).toBe(1);
    expect(logo.rehostable).toBe(1);

    // The dropped-bucket URL is SEEN — reported, not quietly skipped. A sweep that
    // only looked for rehostable URLs would never know it was there.
    const short = mine.find((e) => e.column === "short_url")!;
    expect(short.unmigratable).toEqual([DROPPED]);
    expect(short.rehostable).toBe(1);

    // …and a jsonb gallery counts every URL in the document, not one per row.
    const gallery = mine.find((e) => e.column === "gallery")!;
    expect(gallery.refs).toBeGreaterThan(gallery.rows);

    // After the rewrite there is nothing left to find.
    await rewriteAll();
    const again = await buildInventory(ctx());
    expect(again.filter((e) => e.schema === SCHEMA && e.rehostable > 0)).toEqual([]);
  });
});
