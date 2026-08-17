#!/usr/bin/env node
// Stage 1 of the two-stage migration (Part 3 §2): pull every V1 table into a
// `v1_staging` schema in the V3 database, BYTE-FAITHFULLY. Same table names,
// same columns, uuid PKs intact, no reshaping. Nothing V3-specific happens here
// — that is Stage 2's job (scripts/migration/lib.ts), which reads only from
// v1_staging.
//
// Why the split: an extraction bug and a transform bug can no longer hide
// behind each other. Gate 1 (verify-staging.mjs) isolates the first; Gate 2
// (database/scripts/verify-migration.mjs) isolates the second. The expensive
// HTTP extract runs once per rehearsal while the transforms re-run locally in
// seconds, and cutover day shrinks to extract + verified replay.
//
// TWO SOURCES, one code path. The adapter yields pages of JSON rows; everything
// downstream is identical, so pointing at live V1 is a config change:
//
//   pg    the 2026-07-16 local restore (and any future full restore)
//   http  the live `migration-export` edge function, V2's proven puller
//         (GET /tables, /export?table=&limit=&offset=, /auth/users?page=&limit=)
//         — needs a fresh 90-day gmig_ Bearer token, minted at rehearsal #1.
//
// The DDL for v1_staging is DERIVED, never hand-written: 199 tables + auth.users
// introspected from a pg source and emitted to v1-staging.sql. At cutover the
// HTTP source has no catalog to introspect, so the committed DDL is applied and
// the rows are coerced into it by json_populate_recordset — exactly V2's trick.
// A table or column that appears in live V1 but not in the DDL is a
// stop-and-classify, per the §5 runbook, not a silent skip.
//
// Usage:
//   node scripts/migration/extract.mjs --self-check
//   node scripts/migration/extract.mjs --source-url=… --target-url=…            # dry run
//   node scripts/migration/extract.mjs --source-url=… --target-url=… --apply
//   node scripts/migration/extract.mjs --source-url=… --emit-ddl
//   node scripts/migration/extract.mjs --source-http=… --token=… --target-url=… --apply
//
// Exit 0 ok · 1 extraction failure · 2 usage/config error.

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CENSUS_PATH = path.join(HERE, "v1-tables.json");
const MAPPING_PATH = path.join(HERE, "mapping.json");
const DDL_PATH = path.join(HERE, "v1-staging.sql");

export const STAGING_SCHEMA = "v1_staging";

// ── CLI ─────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const flags = {
    apply: false,
    selfCheck: false,
    emitDdl: false,
    json: false,
    sourceUrl: null,
    sourceHttp: null,
    token: null,
    targetUrl: null,
    ddl: null,
    tables: null,
    pageSize: 1000,
  };
  for (const arg of argv) {
    if (arg === "--apply") flags.apply = true;
    else if (arg === "--dry-run") flags.apply = false;
    else if (arg === "--self-check") flags.selfCheck = true;
    else if (arg === "--emit-ddl") flags.emitDdl = true;
    else if (arg === "--json") flags.json = true;
    else if (arg.startsWith("--source-url=")) flags.sourceUrl = arg.slice(13);
    else if (arg.startsWith("--source-http=")) flags.sourceHttp = arg.slice(14).replace(/\/+$/, "");
    else if (arg.startsWith("--token=")) flags.token = arg.slice(8);
    else if (arg.startsWith("--target-url=")) flags.targetUrl = arg.slice(13);
    else if (arg.startsWith("--ddl=")) flags.ddl = arg.slice(6);
    else if (arg.startsWith("--tables=")) flags.tables = arg.slice(9).split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg.startsWith("--page-size=")) flags.pageSize = Number(arg.slice(12));
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(flags.pageSize) || flags.pageSize < 1) throw new Error("--page-size must be a positive integer");
  if (flags.sourceUrl && flags.sourceHttp) throw new Error("pick one source: --source-url= (pg) or --source-http= (live edge function)");
  return flags;
}

// ── Pure helpers (all asserted by --self-check) ──────────────────────────────

export const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

/**
 * The staging column type for a V1 column.
 *
 * Everything in pg_catalog is reproduced verbatim, so uuid stays uuid, numeric
 * keeps its precision and jsonb stays jsonb. The one deliberate representation
 * change: types that live outside pg_catalog — V1's ~20 enums and pgvector's
 * vector(1536) — become text (text[] for their arrays).
 *
 * Values are unchanged: Postgres renders an enum as its label and a vector as
 * '[…]', and the driver hands both sides back as the same JavaScript string, so
 * Gate 1's content check still compares them exactly. What it buys: staging
 * needs no CREATE TYPE ordering and no pgvector extension, and the HTTP source
 * (which sends JSON strings) loads through the identical path. Embeddings are
 * never carried into V3 anyway — they are re-embedded (§1.5).
 */
export function stagingType(formatted, typeNamespace) {
  if (typeNamespace === "pg_catalog") return formatted;
  return formatted.endsWith("[]") ? "text[]" : "text";
}

/** `public.foo` / `auth.users` → the staging table that holds it. */
export function stagingTableFor(schema, name) {
  return schema === "public" ? name : `${schema}_${name}`;
}

/**
 * Re-point a FOREIGN KEY definition at v1_staging. Staging keeps V1's 277 FK
 * constraints so Gate 1's orphan scan is a real check rather than a vacuous
 * one; they are created NOT VALID and the load runs with
 * session_replication_role = replica, so a pre-existing V1 orphan is REPORTED
 * by the gate instead of aborting the extract.
 *
 * Returns null when the parent is not staged — the caller reports that rather
 * than dropping it quietly.
 */
export function rewriteFkDef(def, parentSchema, parentName, stagedTables) {
  const target = stagingTableFor(parentSchema, parentName);
  if (!stagedTables.has(target)) return null;
  const m = def.match(/^FOREIGN KEY \(([^)]+)\) REFERENCES ([^(]+)\(([^)]+)\)(.*)$/is);
  if (!m) return null;
  const tail = m[4].replace(/\s*NOT VALID\s*$/i, "");
  return `FOREIGN KEY (${m[1]}) REFERENCES ${quoteIdent(STAGING_SCHEMA)}.${quoteIdent(target)}(${m[3]})${tail}`;
}

/** Page URL for the live edge function. `auth.users` has its own route. */
export function pageUrl(base, table, limit, offset) {
  if (table === "auth_users") {
    return `${base}/migration-export/auth/users?page=${Math.floor(offset / limit) + 1}&limit=${limit}`;
  }
  return `${base}/migration-export/export?table=${encodeURIComponent(table)}&limit=${limit}&offset=${offset}`;
}

/** The tables Stage 1 must stage: the 199-table census plus the declared extras. */
export function stagingPlan(census, mapping) {
  const plan = census.tables.map((t) => ({ source: { schema: "public", name: t }, staging: t, census: true }));
  for (const key of Object.keys(mapping.extraSources ?? {})) {
    if (key.startsWith("$")) continue;
    const [schema, name] = key.split(".");
    if (!schema || !name) throw new Error(`extraSources key must be schema-qualified: ${key}`);
    plan.push({ source: { schema, name }, staging: mapping.extraSources[key].stagingTable ?? stagingTableFor(schema, name), census: false });
  }
  const seen = new Set();
  for (const p of plan) {
    if (seen.has(p.staging)) throw new Error(`two sources collide on staging table ${p.staging}`);
    seen.add(p.staging);
  }
  return plan;
}

// ── DDL generation (pg source only) ─────────────────────────────────────────

async function introspectDdl(source, plan) {
  const stagedTables = new Set(plan.map((p) => p.staging));
  const statements = [
    `-- GENERATED by scripts/migration/extract.mjs --emit-ddl. Do not hand-edit.`,
    `-- Byte-faithful staging schema for Stage 1 of the V1 -> V3 migration (Part 3 §2).`,
    `-- Regenerate from a full V1 restore; apply at cutover when the source is the`,
    `-- live edge function, which has no catalog to introspect.`,
    ``,
    `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(STAGING_SCHEMA)};`,
    ``,
  ];
  const fkStatements = [];
  const unstagedParents = [];

  for (const entry of plan) {
    const { schema, name } = entry.source;
    const { rows: cols } = await source.query(
      `SELECT a.attname                                     AS column_name,
              format_type(a.atttypid, a.atttypmod)          AS formatted,
              tn.nspname                                    AS type_namespace,
              a.attnotnull                                  AS not_null
         FROM pg_attribute a
         JOIN pg_class c      ON c.oid = a.attrelid
         JOIN pg_namespace n  ON n.oid = c.relnamespace
         JOIN pg_type t       ON t.oid = a.atttypid
         JOIN pg_namespace tn ON tn.oid = t.typnamespace
        WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum`,
      [schema, name],
    );
    if (cols.length === 0) throw new Error(`source table ${schema}.${name} does not exist`);

    const defs = cols.map(
      (c) => `  ${quoteIdent(c.column_name)} ${stagingType(c.formatted, c.type_namespace)}${c.not_null ? " NOT NULL" : ""}`,
    );

    // Primary key + uniques, verbatim. The PK is what lets Gate 1's content
    // check join the two sides row for row; the uniques are not decoration —
    // 57 of V1's foreign keys reference a UNIQUE column rather than a PK, and
    // Postgres refuses the FK without one.
    const { rows: keys } = await source.query(
      `SELECT c.contype, pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE c.contype IN ('p', 'u') AND n.nspname = $1 AND cl.relname = $2
        ORDER BY c.contype DESC, c.conname`,
      [schema, name],
    );
    for (const k of keys) defs.push(`  ${k.def}`);

    statements.push(
      `CREATE TABLE IF NOT EXISTS ${quoteIdent(STAGING_SCHEMA)}.${quoteIdent(entry.staging)} (\n${defs.join(",\n")}\n);`,
    );

    // Standalone unique indexes (not backed by a constraint) can also back an
    // FK, so they are reproduced too. Renamed, because index names are unique
    // per schema and 200 tables now share one.
    const { rows: uniques } = await source.query(
      `SELECT ci.relname AS idx, pg_get_indexdef(ix.indexrelid) AS def
         FROM pg_index ix
         JOIN pg_class c   ON c.oid = ix.indrelid
         JOIN pg_class ci  ON ci.oid = ix.indexrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2 AND ix.indisunique AND NOT ix.indisprimary
          AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = ix.indexrelid)
        ORDER BY ci.relname`,
      [schema, name],
    );
    for (const u of uniques) {
      const renamed = `${entry.staging}__${u.idx}`.slice(0, 63);
      statements.push(
        u.def
          .replace(/^CREATE UNIQUE INDEX \S+ ON /i, `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdent(renamed)} ON `)
          .replace(
            new RegExp(`\\b${schema}\\.${name}\\b`),
            `${quoteIdent(STAGING_SCHEMA)}.${quoteIdent(entry.staging)}`,
          ) + ";",
      );
    }

    const { rows: fks } = await source.query(
      `SELECT c.conname, pg_get_constraintdef(c.oid) AS def, pn.nspname AS parent_schema, pc.relname AS parent_name
         FROM pg_constraint c
         JOIN pg_class cl      ON cl.oid = c.conrelid
         JOIN pg_namespace n   ON n.oid = cl.relnamespace
         JOIN pg_class pc      ON pc.oid = c.confrelid
         JOIN pg_namespace pn  ON pn.oid = pc.relnamespace
        WHERE c.contype = 'f' AND n.nspname = $1 AND cl.relname = $2
        ORDER BY c.conname`,
      [schema, name],
    );
    for (const fk of fks) {
      const rewritten = rewriteFkDef(fk.def, fk.parent_schema, fk.parent_name, stagedTables);
      if (!rewritten) {
        unstagedParents.push(`${schema}.${name}.${fk.conname} -> ${fk.parent_schema}.${fk.parent_name}`);
        continue;
      }
      fkStatements.push(
        `ALTER TABLE ${quoteIdent(STAGING_SCHEMA)}.${quoteIdent(entry.staging)} ` +
          `ADD CONSTRAINT ${quoteIdent(fk.conname)} ${rewritten} NOT VALID;`,
      );
    }
  }

  if (unstagedParents.length) {
    statements.push(
      ``,
      `-- FKs NOT reproduced because their parent is outside the staged set`,
      `-- (${unstagedParents.length}): ${unstagedParents.join("; ")}`,
    );
  }
  statements.push(``, `-- Foreign keys (NOT VALID: the load runs with replication_role = replica, so`, `-- a pre-existing V1 orphan is reported by Gate 1 rather than aborting the load).`, ...fkStatements);
  return { sql: statements.join("\n") + "\n", unstagedParents, fkCount: fkStatements.length };
}

// ── Source adapters ─────────────────────────────────────────────────────────

/** Reads pages of JSON rows out of a full V1 Postgres restore. */
export function pgSource(client, pageSize) {
  return {
    label: "pg restore",
    async count(entry) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM ${quoteIdent(entry.source.schema)}.${quoteIdent(entry.source.name)}`,
      );
      return rows[0].n;
    },
    async *pages(entry) {
      // ctid ordering is stable and free, but only inside one snapshot — the
      // caller wraps the whole extract in a REPEATABLE READ transaction, which
      // is also what makes the 200 per-table counts mutually consistent.
      for (let offset = 0; ; offset += pageSize) {
        const { rows } = await client.query(
          `SELECT to_jsonb(x) AS j FROM ${quoteIdent(entry.source.schema)}.${quoteIdent(entry.source.name)} x ORDER BY x.ctid LIMIT $1 OFFSET $2`,
          [pageSize, offset],
        );
        if (rows.length === 0) return;
        yield rows.map((r) => r.j);
        if (rows.length < pageSize) return;
      }
    },
  };
}

/** Reads pages out of the live `migration-export` edge function (V2's puller). */
export function httpSource(base, token, pageSize) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const get = async (url) => {
    const res = await fetch(url, auth);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  };
  return {
    label: `live edge function ${base}`,
    async count(entry) {
      const page = await get(pageUrl(base, entry.staging, 1, 0));
      return page.count ?? null;
    },
    async *pages(entry) {
      let total = null;
      for (let offset = 0; ; offset += pageSize) {
        const page = await get(pageUrl(base, entry.staging, pageSize, offset));
        total ??= page.count ?? null;
        const rows = page.rows ?? page.users ?? [];
        if (rows.length === 0) return;
        yield rows;
        if (rows.length < pageSize) return;
        if (total != null && offset + rows.length >= total) return;
      }
    },
  };
}

// ── Load ────────────────────────────────────────────────────────────────────

async function loadInto(target, plan, source, report) {
  await target.query("SET session_replication_role = replica");

  // Truncate-first: the extract is idempotent by construction, so an interrupted
  // run is fixed by running it again (§2, "truncate-and-reload is idempotent").
  const all = plan.map((p) => `${quoteIdent(STAGING_SCHEMA)}.${quoteIdent(p.staging)}`).join(", ");
  await target.query(`TRUNCATE ${all} RESTART IDENTITY CASCADE`);

  for (const entry of plan) {
    const { rows: colRows } = await target.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2 AND is_generated <> 'ALWAYS'`,
      [STAGING_SCHEMA, entry.staging],
    );
    const stagingCols = new Set(colRows.map((r) => r.column_name));

    const expected = await source.count(entry);
    let loaded = 0;
    const unknownColumns = new Set();

    for await (const rows of source.pages(entry)) {
      const keys = Object.keys(rows[0]);
      for (const k of keys) if (!stagingCols.has(k)) unknownColumns.add(k);
      const shared = keys.filter((k) => stagingCols.has(k));
      if (shared.length === 0) throw new Error(`${entry.staging}: source rows share no column with the staging table`);
      const list = shared.map(quoteIdent).join(", ");
      await target.query(
        `INSERT INTO ${quoteIdent(STAGING_SCHEMA)}.${quoteIdent(entry.staging)} (${list})
         SELECT ${list} FROM json_populate_recordset(NULL::${quoteIdent(STAGING_SCHEMA)}.${quoteIdent(entry.staging)}, $1::json)`,
        [JSON.stringify(rows)],
      );
      loaded += rows.length;
    }

    // A column live V1 grew since the DDL was generated is a stop-and-classify
    // (§5 runbook step 3), never a silent drop.
    if (unknownColumns.size) {
      report.driftedColumns.push({ table: entry.staging, columns: [...unknownColumns] });
    }
    report.tables.push({ table: entry.staging, expected, loaded, census: entry.census });
    if (expected != null && expected !== loaded) {
      report.failures.push(`${entry.staging}: source reported ${expected} rows, staged ${loaded}`);
    }
  }

  // Sequences last, so nothing that reads staging can collide. V1 is uuid-PK
  // throughout, so this normally finds nothing — it is here because "normally"
  // is not a guarantee.
  await target.query(
    `DO $$
     DECLARE r record;
     BEGIN
       FOR r IN
         SELECT c.relname AS tbl, a.attname AS col,
                pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) AS seq
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
          WHERE n.nspname = '${STAGING_SCHEMA}' AND c.relkind = 'r'
            AND pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) IS NOT NULL
       LOOP
         EXECUTE format('SELECT setval(%L, GREATEST((SELECT coalesce(max(%I), 0) FROM ${STAGING_SCHEMA}.%I), 1))', r.seq, r.col, r.tbl);
       END LOOP;
     END $$`,
  );
  await target.query("SET session_replication_role = DEFAULT");
}

// ── Self-check ──────────────────────────────────────────────────────────────

function selfCheck() {
  assert.equal(quoteIdent("plain"), '"plain"');
  assert.equal(quoteIdent('we"ird'), '"we""ird"');

  // Catalog types survive verbatim, precision and all.
  assert.equal(stagingType("uuid", "pg_catalog"), "uuid");
  assert.equal(stagingType("numeric(10,2)", "pg_catalog"), "numeric(10,2)");
  assert.equal(stagingType("timestamp with time zone", "pg_catalog"), "timestamp with time zone");
  assert.equal(stagingType("text[]", "pg_catalog"), "text[]");
  // Enums and pgvector become text / text[]; values are unchanged.
  assert.equal(stagingType("app_role", "public"), "text");
  assert.equal(stagingType("degree_level[]", "public"), "text[]");
  assert.equal(stagingType("vector(1536)", "public"), "text");

  assert.equal(stagingTableFor("public", "businesses"), "businesses");
  assert.equal(stagingTableFor("auth", "users"), "auth_users");

  const staged = new Set(["businesses", "auth_users"]);
  assert.equal(
    rewriteFkDef("FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE", "public", "businesses", staged),
    'FOREIGN KEY (business_id) REFERENCES "v1_staging"."businesses"(id) ON DELETE CASCADE',
  );
  assert.equal(
    rewriteFkDef("FOREIGN KEY (user_id) REFERENCES auth.users(id)", "auth", "users", staged),
    'FOREIGN KEY (user_id) REFERENCES "v1_staging"."auth_users"(id)',
  );
  // An unstaged parent yields null so the caller can report it, never drop it.
  assert.equal(rewriteFkDef("FOREIGN KEY (o) REFERENCES storage.objects(id)", "storage", "objects", staged), null);

  assert.equal(
    pageUrl("https://x.fn", "businesses", 1000, 2000),
    "https://x.fn/migration-export/export?table=businesses&limit=1000&offset=2000",
  );
  assert.equal(pageUrl("https://x.fn", "auth_users", 50, 100), "https://x.fn/migration-export/auth/users?page=3&limit=50");

  const census = JSON.parse(readFileSync(CENSUS_PATH, "utf8"));
  const mapping = JSON.parse(readFileSync(MAPPING_PATH, "utf8"));
  assert.equal(census.tables.length, 199, "the census must stay at 199 tables until a re-extract says otherwise");
  const plan = stagingPlan(census, mapping);
  assert.equal(plan.filter((p) => p.census).length, 199);
  assert.ok(plan.some((p) => p.staging === "auth_users"), "auth.users must be staged — mig.map_users keys on its email");

  // A colliding extra source must be rejected, not silently overwrite a census table.
  assert.throws(
    () => stagingPlan(census, { extraSources: { "auth.users": { stagingTable: "businesses" } } }),
    /collide/,
  );

  console.log(`self-check: ok — ${plan.length} staging tables (${plan.filter((p) => p.census).length} census + ${plan.length - 199} extra)`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function connect(url, label, readOnly) {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`${label}: cannot connect — ${err.message}`);
  }
  if (readOnly) await client.query("SET default_transaction_read_only = on");
  return client;
}

const redact = (url) => String(url).replace(/\/\/[^@/]*@/, "//***@");

async function main() {
  let flags;
  try {
    flags = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    return 2;
  }

  if (flags.selfCheck) {
    try {
      selfCheck();
      return 0;
    } catch (err) {
      console.error(`self-check FAILED: ${err.message}`);
      return 2;
    }
  }

  const census = JSON.parse(readFileSync(CENSUS_PATH, "utf8"));
  const mapping = JSON.parse(readFileSync(MAPPING_PATH, "utf8"));
  let plan = stagingPlan(census, mapping);
  if (flags.tables) {
    const wanted = new Set(flags.tables);
    plan = plan.filter((p) => wanted.has(p.staging));
    if (plan.length === 0) {
      console.error(`--tables matched nothing`);
      return 2;
    }
  }

  const sourceUrl = flags.sourceUrl || (flags.sourceHttp ? null : process.env.V1_DATABASE_URL);
  const sourceHttp = flags.sourceHttp || (sourceUrl ? null : process.env.V1_FUNCTIONS_URL);
  const token = flags.token || process.env.GMIG_TOKEN;
  const targetUrl = flags.targetUrl || process.env.V3_DATABASE_URL;

  if (!sourceUrl && !sourceHttp) {
    console.error("no source: set --source-url= / V1_DATABASE_URL (pg restore) or --source-http= / V1_FUNCTIONS_URL (live)");
    return 2;
  }
  if (sourceHttp && !token) {
    console.error("the live source needs a fresh 90-day gmig_ Bearer token: --token= or GMIG_TOKEN");
    return 2;
  }

  // ── --emit-ddl: introspect a pg source and write v1-staging.sql ──
  if (flags.emitDdl) {
    if (!sourceUrl) {
      console.error("--emit-ddl needs a pg source (--source-url=): the edge function exposes rows, not a catalog");
      return 2;
    }
    const src = await connect(sourceUrl, "source (V1)", true);
    try {
      const { sql, unstagedParents, fkCount } = await introspectDdl(src, plan);
      const out = flags.ddl ? path.resolve(flags.ddl) : DDL_PATH;
      writeFileSync(out, sql);
      console.log(`wrote ${out}: ${plan.length} tables, ${fkCount} foreign keys`);
      for (const u of unstagedParents) console.log(`  FK not reproduced (parent not staged): ${u}`);
      return 0;
    } finally {
      await src.end().catch(() => {});
    }
  }

  if (!targetUrl) {
    console.error("set --target-url= / V3_DATABASE_URL — the V3 database that receives v1_staging");
    return 2;
  }

  const ddlPath = flags.ddl ? path.resolve(flags.ddl) : DDL_PATH;
  if (!flags.apply) {
    console.log(`DRY RUN — nothing is written. Stage 1: V1 -> ${STAGING_SCHEMA}`);
    console.log(`  source : ${sourceUrl ? `pg ${redact(sourceUrl)}` : `http ${sourceHttp}`}`);
    console.log(`  target : ${redact(targetUrl)} schema ${STAGING_SCHEMA}`);
    console.log(`  DDL    : ${ddlPath}${sourceUrl ? " (regenerate with --emit-ddl)" : " (committed — the live source has no catalog)"}`);
    console.log(`  tables : ${plan.length} (${plan.filter((p) => p.census).length} census + ${plan.length - plan.filter((p) => p.census).length} extra)`);
    console.log(`  load   : TRUNCATE … RESTART IDENTITY CASCADE, then json_populate_recordset per ${flags.pageSize}-row page,`);
    console.log(`           session_replication_role = replica throughout, sequences setval'd after.`);
    console.log(`Add --apply to execute. Then run verify-staging.mjs (Gate 1).`);
    return 0;
  }

  const src = sourceUrl ? await connect(sourceUrl, "source (V1)", true) : null;
  // One snapshot for the whole extract: ctid pagination is only stable inside
  // it, and 200 tables read at 200 different instants is not a consistent V1.
  if (src) await src.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const target = await connect(targetUrl, "target (V3)", false);
  const source = src ? pgSource(src, flags.pageSize) : httpSource(sourceHttp, token, flags.pageSize);
  const report = { source: source.label, tables: [], driftedColumns: [], failures: [] };

  try {
    // The DDL is regenerated from a pg source (it is the catalog of record) and
    // applied from the committed file when the source is the edge function.
    if (src) {
      const { sql, unstagedParents } = await introspectDdl(src, plan);
      // A --tables subset describes a subset of V1, so it must not be allowed to
      // overwrite the committed full-schema DDL that cutover day depends on.
      const persist = !flags.tables || flags.ddl;
      if (persist) writeFileSync(ddlPath, sql);
      await target.query(sql);
      report.ddl = { path: persist ? ddlPath : "(in memory: --tables subset)", regenerated: true, unstagedParents };
    } else {
      report.ddl = { path: ddlPath, regenerated: false };
      await target.query(readFileSync(ddlPath, "utf8"));
    }
    await loadInto(target, plan, source, report);
  } finally {
    await src?.end().catch(() => {});
    await target.end().catch(() => {});
  }

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Stage 1 — ${source.label} -> ${STAGING_SCHEMA}`);
    for (const t of report.tables) console.log(`  ${t.loaded === t.expected ? "ok  " : "FAIL"} ${t.table}: ${t.loaded} rows`);
    const total = report.tables.reduce((n, t) => n + t.loaded, 0);
    console.log(`  ${report.tables.length} tables, ${total} rows staged.`);
    for (const d of report.driftedColumns) console.log(`  DRIFT ${d.table}: source has columns the staging DDL does not: ${d.columns.join(", ")} — stop and classify`);
    for (const f of report.failures) console.log(`  FAIL  ${f}`);
  }

  const bad = report.failures.length + report.driftedColumns.length;
  console.log(bad === 0 ? `Extract complete. Run verify-staging.mjs next (Gate 1).` : `Extract FAILED — ${bad} issue(s).`);
  return bad === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
