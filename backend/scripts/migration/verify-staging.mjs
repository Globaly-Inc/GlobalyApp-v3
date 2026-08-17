#!/usr/bin/env node
// GATE 1 — staging parity (Part 3 §3). Ported from V2's verify-db.mjs, whose
// four checks are unchanged because they were live-tested across two rehearsals
// (22 users + 138,149 rows across 195 tables, all parity gates green).
//
//   1. count      V1 rows == v1_staging rows, per table. Exact, no allowance.
//   2. content    rows joined on the primary key, normalized deep-equal over the
//                 column intersection. Names how many rows drifted, not a
//                 checksum, so a failure says how bad it is.
//   3. fk         no orphan in v1_staging. Real, not vacuous: the staging DDL
//                 reproduces all 277 of V1's foreign keys.
//   4. sequence   every staging sequence >= max(pk).
//
// Green here means EXTRACTION is beyond doubt. Any later discrepancy is a
// transform bug, by elimination — that separation is the whole point of the
// two-stage design, and it is why this gate must never be softened.
//
// Self-parity is the CI smoke: point both URLs at the same database with
// --source-schema=v1_staging and every check must go green. A gate that cannot
// pass a copy of itself cannot be trusted to fail on a real difference.
//
// Usage:
//   node scripts/migration/verify-staging.mjs --self-check
//   node scripts/migration/verify-staging.mjs --source-url=… --target-url=…
//   node scripts/migration/verify-staging.mjs --source-url=X --target-url=X --source-schema=v1_staging
//   node scripts/migration/verify-staging.mjs --source-http=… --token=… --target-url=…
//
// Exit 0 green · 1 mismatch (DO NOT proceed to Stage 2) · 2 usage/config error.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { STAGING_SCHEMA, httpSource, pgSource, quoteIdent, stagingPlan } from "./extract.mjs";
import { canon, norm } from "./normalize.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── CLI ─────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const flags = {
    selfCheck: false,
    json: false,
    sourceUrl: null,
    sourceHttp: null,
    token: null,
    targetUrl: null,
    sourceSchema: null,
    tables: null,
    pageSize: 1000,
    maxDiffs: 5,
  };
  for (const arg of argv) {
    if (arg === "--self-check") flags.selfCheck = true;
    else if (arg === "--json") flags.json = true;
    else if (arg.startsWith("--source-url=")) flags.sourceUrl = arg.slice(13);
    else if (arg.startsWith("--source-http=")) flags.sourceHttp = arg.slice(14).replace(/\/+$/, "");
    else if (arg.startsWith("--token=")) flags.token = arg.slice(8);
    else if (arg.startsWith("--target-url=")) flags.targetUrl = arg.slice(13);
    else if (arg.startsWith("--source-schema=")) flags.sourceSchema = arg.slice(16);
    else if (arg.startsWith("--tables=")) flags.tables = arg.slice(9).split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg.startsWith("--page-size=")) flags.pageSize = Number(arg.slice(12));
    else if (arg.startsWith("--max-diffs=")) flags.maxDiffs = Number(arg.slice(12));
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(flags.maxDiffs) || flags.maxDiffs < 0) throw new Error("--max-diffs must be a non-negative integer");
  if (flags.sourceUrl && flags.sourceHttp) throw new Error("pick one source: --source-url= (pg) or --source-http= (live edge function)");
  return flags;
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/** Row key over the primary key, or over every shared column when there is none. */
export function rowKey(row, keyCols) {
  return keyCols.map((c) => JSON.stringify(norm(row[c]))).join("");
}

/** Columns present on both sides. The intersection is the drift tolerance. */
export function sharedColumns(sourceRow, stagingCols) {
  return Object.keys(sourceRow).filter((c) => stagingCols.has(c)).sort();
}

/**
 * Compare two row sets already keyed by primary key.
 * Returns { missing, extra, differing, samples } — never throws on shape.
 */
export function diffRows(sourceByKey, stagingByKey, columns, maxDiffs) {
  const missing = [];
  const extra = [];
  let differing = 0;
  const samples = [];
  for (const [key, srcRow] of sourceByKey) {
    const tgtRow = stagingByKey.get(key);
    if (!tgtRow) {
      missing.push(key);
      continue;
    }
    const cols = [];
    for (const c of columns) {
      if (canon(srcRow[c]) !== canon(tgtRow[c])) cols.push(c);
    }
    if (cols.length) {
      differing += 1;
      if (samples.length < maxDiffs) samples.push({ key, columns: cols });
    }
  }
  for (const key of stagingByKey.keys()) if (!sourceByKey.has(key)) extra.push(key);
  return { missing, extra, differing, samples };
}

// ── Checks ──────────────────────────────────────────────────────────────────

async function stagingMeta(target, table) {
  const { rows: cols } = await target.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
    [STAGING_SCHEMA, table],
  );
  const { rows: pk } = await target.query(
    `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      WHERE i.indrelid = ($1 || '.' || quote_ident($2))::regclass AND i.indisprimary
      ORDER BY a.attnum`,
    [quoteIdent(STAGING_SCHEMA), table],
  );
  return { columns: new Set(cols.map((r) => r.column_name)), pkCols: pk.map((r) => r.attname) };
}

async function collectSource(source, entry) {
  const rows = [];
  for await (const page of source.pages(entry)) rows.push(...page);
  return rows;
}

/** Checks 1 + 2, per table. */
async function verifyTable(entry, source, target, maxDiffs) {
  const meta = await stagingMeta(target, entry.staging);
  if (meta.columns.size === 0) {
    return { table: entry.staging, error: `v1_staging.${entry.staging} does not exist — run extract.mjs --apply first` };
  }

  const srcRows = await collectSource(source, entry);
  const { rows: tgtRaw } = await target.query(
    `SELECT to_jsonb(x) AS j FROM ${quoteIdent(STAGING_SCHEMA)}.${quoteIdent(entry.staging)} x`,
  );
  const tgtRows = tgtRaw.map((r) => r.j);

  const result = {
    table: entry.staging,
    count: { pass: srcRows.length === tgtRows.length, source: srcRows.length, staging: tgtRows.length },
    content: { pass: true, comparedRows: 0, comparedColumns: 0, differing: 0, samples: [], missing: [], extra: [] },
  };
  if (srcRows.length === 0 && tgtRows.length === 0) return result;
  if (srcRows.length === 0) {
    result.content.extra = tgtRows.slice(0, maxDiffs).map((_, i) => `row ${i}`);
    result.content.pass = false;
    return result;
  }

  const columns = sharedColumns(srcRows[0], meta.columns);
  const keyCols = meta.pkCols.length ? meta.pkCols.filter((c) => columns.includes(c)) : columns;
  if (keyCols.length === 0) {
    return { ...result, error: `${entry.staging}: no usable key column on either side` };
  }

  const index = (rows) => {
    const byKey = new Map();
    const dupes = [];
    for (const r of rows) {
      const k = rowKey(r, keyCols);
      if (byKey.has(k)) dupes.push(k);
      else byKey.set(k, r);
    }
    return { byKey, dupes };
  };
  const src = index(srcRows);
  const tgt = index(tgtRows);

  const d = diffRows(src.byKey, tgt.byKey, columns, maxDiffs);
  result.content = {
    pass: d.differing === 0 && d.missing.length === 0 && d.extra.length === 0 && src.dupes.length === 0 && tgt.dupes.length === 0,
    comparedRows: src.byKey.size - d.missing.length,
    comparedColumns: columns.length,
    differing: d.differing,
    samples: d.samples,
    missing: d.missing.slice(0, maxDiffs),
    missingTotal: d.missing.length,
    extra: d.extra.slice(0, maxDiffs),
    extraTotal: d.extra.length,
    duplicateSourceKeys: src.dupes.slice(0, maxDiffs),
    duplicateStagingKeys: tgt.dupes.slice(0, maxDiffs),
  };
  return result;
}

/** Check 3: FK orphans inside v1_staging. */
export async function scanForeignKeys(target, maxDiffs) {
  const { rows: constraints } = await target.query(
    `SELECT c.conname, c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent,
            pg_get_constraintdef(c.oid) AS def
       FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f' AND n.nspname = $1
      ORDER BY c.conname`,
    [STAGING_SCHEMA],
  );
  const violations = [];
  for (const fk of constraints) {
    const m = fk.def.match(/FOREIGN KEY \(([^)]+)\) REFERENCES (.+)\(([^)]+)\)/i);
    if (!m) {
      violations.push({ constraint: fk.conname, child: fk.child, error: `unparseable: ${fk.def}` });
      continue;
    }
    const childCols = m[1].split(",").map((s) => s.trim());
    const parentCols = m[3].split(",").map((s) => s.trim());
    const join = childCols.map((c, i) => `p.${parentCols[i]} = c.${c}`).join(" AND ");
    const notNull = childCols.map((c) => `c.${c} IS NOT NULL`).join(" AND ");
    const { rows } = await target.query(
      `SELECT count(*)::int AS n FROM ${fk.child} c WHERE ${notNull} AND NOT EXISTS (SELECT 1 FROM ${fk.parent} p WHERE ${join})`,
    );
    if (rows[0].n > 0) violations.push({ constraint: fk.conname, child: fk.child, parent: fk.parent, orphans: rows[0].n });
  }
  return { pass: violations.length === 0, scanned: constraints.length, violations: violations.slice(0, maxDiffs), total: violations.length };
}

/** Check 4: every staging sequence at or past max(pk). */
export async function scanSequences(target, maxDiffs) {
  const { rows: serials } = await target.query(
    `SELECT c.relname AS tbl, a.attname AS col,
            pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) AS seq
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname = $1 AND c.relkind = 'r'
        AND pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) IS NOT NULL
      ORDER BY c.relname, a.attname`,
    [STAGING_SCHEMA],
  );
  const behind = [];
  for (const s of serials) {
    const { rows } = await target.query(
      `SELECT (SELECT coalesce(max(${quoteIdent(s.col)}), 0) FROM ${quoteIdent(STAGING_SCHEMA)}.${quoteIdent(s.tbl)}) AS max_pk,
              (SELECT last_value - CASE WHEN is_called THEN 0 ELSE 1 END FROM ${s.seq}) AS at`,
    );
    const maxPk = Number(rows[0].max_pk);
    const at = Number(rows[0].at);
    if (at < maxPk) behind.push({ table: s.tbl, column: s.col, sequence: s.seq, at, maxPk });
  }
  return { pass: behind.length === 0, scanned: serials.length, behind: behind.slice(0, maxDiffs), total: behind.length };
}

// ── Self-check ──────────────────────────────────────────────────────────────

function selfCheck() {
  assert.equal(norm("2020-01-02T03:04:05Z"), "@1577934245000");
  assert.equal(canon(new Date("2020-01-02T03:04:05Z")), canon("2020-01-02T03:04:05.000+00:00"));
  assert.equal(canon({ b: 1, a: 2 }), canon({ a: 2, b: 1 }));
  assert.notEqual(canon({ a: 1 }), canon({ a: 2 }));

  assert.equal(rowKey({ id: "x", n: 1 }, ["id"]), '"x"');
  // Two different keys must not collide through concatenation.
  assert.notEqual(rowKey({ a: "x", b: "yz" }, ["a", "b"]), rowKey({ a: "xy", b: "z" }, ["a", "b"]));

  assert.deepEqual(sharedColumns({ a: 1, b: 2, c: 3 }, new Set(["b", "c", "d"])), ["b", "c"]);

  const src = new Map([["k1", { v: 1 }], ["k2", { v: 2 }]]);
  const same = new Map([["k1", { v: 1 }], ["k2", { v: 2 }]]);
  let d = diffRows(src, same, ["v"], 5);
  assert.deepEqual([d.missing, d.extra, d.differing], [[], [], 0], "identical sets must be clean");

  d = diffRows(src, new Map([["k1", { v: 1 }], ["k2", { v: 99 }]]), ["v"], 5);
  assert.equal(d.differing, 1, "a mutated value must be caught");
  d = diffRows(src, new Map([["k1", { v: 1 }]]), ["v"], 5);
  assert.deepEqual(d.missing, ["k2"], "a missing row must be caught");
  d = diffRows(src, new Map([...same, ["k3", { v: 3 }]]), ["v"], 5);
  assert.deepEqual(d.extra, ["k3"], "an unexplained extra row must be caught");

  // A timestamp in two representations is NOT drift.
  d = diffRows(
    new Map([["k", { t: "2020-01-02T03:04:05Z" }]]),
    new Map([["k", { t: new Date("2020-01-02T03:04:05Z") }]]),
    ["t"],
    5,
  );
  assert.equal(d.differing, 0, "the same instant in two representations must not read as drift");

  const census = JSON.parse(readFileSync(path.join(HERE, "v1-tables.json"), "utf8"));
  const mapping = JSON.parse(readFileSync(path.join(HERE, "mapping.json"), "utf8"));
  const plan = stagingPlan(census, mapping);
  assert.equal(plan.length, 200);
  console.log(`self-check: ok — Gate 1 covers ${plan.length} staging tables`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function connect(url, label) {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`${label}: cannot connect — ${err.message}`, { cause: err });
  }
  await client.query("SET default_transaction_read_only = on");
  return client;
}

const redact = (url) => String(url).replace(/\/\/[^@/]*@/, "//***@");

export async function main(argv = process.argv.slice(2)) {
  let flags;
  try {
    flags = parseArgs(argv);
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

  const census = JSON.parse(readFileSync(path.join(HERE, "v1-tables.json"), "utf8"));
  const mapping = JSON.parse(readFileSync(path.join(HERE, "mapping.json"), "utf8"));
  let plan = stagingPlan(census, mapping);
  if (flags.sourceSchema) {
    // Self-parity mode: read the "V1 side" out of another schema in the same DB.
    plan = plan.map((p) => ({ ...p, source: { schema: flags.sourceSchema, name: p.staging } }));
  }
  if (flags.tables) {
    const wanted = new Set(flags.tables);
    plan = plan.filter((p) => wanted.has(p.staging));
    if (plan.length === 0) {
      console.error("--tables matched nothing");
      return 2;
    }
  }

  const sourceUrl = flags.sourceUrl || (flags.sourceHttp ? null : process.env.V1_DATABASE_URL);
  const sourceHttp = flags.sourceHttp || (sourceUrl ? null : process.env.V1_FUNCTIONS_URL);
  const token = flags.token || process.env.GMIG_TOKEN;
  const targetUrl = flags.targetUrl || process.env.V3_DATABASE_URL;
  if (!sourceUrl && !sourceHttp) {
    console.error("no source: set --source-url= / V1_DATABASE_URL or --source-http= / V1_FUNCTIONS_URL");
    return 2;
  }
  if (!targetUrl) {
    console.error("set --target-url= / V3_DATABASE_URL — the database holding v1_staging");
    return 2;
  }

  const src = sourceUrl ? await connect(sourceUrl, "source (V1)") : null;
  if (src) await src.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const target = await connect(targetUrl, "target (v1_staging)");
  const source = src ? pgSource(src, flags.pageSize) : httpSource(sourceHttp, token, flags.pageSize);

  const report = {
    source: sourceUrl ? `pg ${redact(sourceUrl)}${flags.sourceSchema ? ` schema ${flags.sourceSchema}` : ""}` : `http ${sourceHttp}`,
    target: `${redact(targetUrl)} schema ${STAGING_SCHEMA}`,
    tables: [],
    fk: null,
    sequences: null,
    failures: 0,
    pass: false,
  };

  try {
    for (const entry of plan) {
      try {
        report.tables.push(await verifyTable(entry, source, target, flags.maxDiffs));
      } catch (err) {
        report.tables.push({ table: entry.staging, error: String(err.message || err).split("\n")[0] });
      }
    }
    report.fk = await scanForeignKeys(target, flags.maxDiffs);
    report.sequences = await scanSequences(target, flags.maxDiffs);
  } finally {
    await src?.end().catch(() => {});
    await target.end().catch(() => {});
  }

  report.failures =
    report.tables.reduce((n, t) => n + (t.error ? 1 : 0) + (t.count && !t.count.pass ? 1 : 0) + (t.content && !t.content.pass ? 1 : 0), 0) +
    (report.fk.pass ? 0 : 1) +
    (report.sequences.pass ? 0 : 1);
  report.pass = report.failures === 0;

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`GATE 1 — staging parity`);
    console.log(`  source : ${report.source}`);
    console.log(`  target : ${report.target}\n`);
    for (const t of report.tables) {
      if (t.error) {
        console.log(`FAIL  ${t.table}: ${t.error}`);
        continue;
      }
      const ok = t.count.pass && t.content.pass;
      console.log(
        `${ok ? "ok  " : "FAIL"}  ${t.table}: ${t.count.staging} rows` +
          (t.content.comparedColumns ? ` x ${t.content.comparedColumns} cols` : "") +
          (ok ? "" : ` — source=${t.count.source} staging=${t.count.staging} differing=${t.content.differing}`),
      );
      if (!ok) {
        if (t.content.missingTotal) console.log(`        missing in staging (${t.content.missingTotal}): ${t.content.missing.join(", ")}`);
        if (t.content.extraTotal) console.log(`        extra in staging (${t.content.extraTotal}): ${t.content.extra.join(", ")}`);
        for (const s of t.content.samples) console.log(`        row ${s.key}: ${s.columns.join(", ")} differ`);
      }
    }
    console.log(`\n${report.fk.pass ? "ok  " : "FAIL"}  fk-orphans: ${report.fk.scanned} constraints scanned, ${report.fk.total} violated`);
    for (const v of report.fk.violations) console.log(`        ${v.error ?? `${v.constraint}: ${v.orphans} orphan(s) ${v.child} -> ${v.parent}`}`);
    console.log(`${report.sequences.pass ? "ok  " : "FAIL"}  sequences : ${report.sequences.scanned} scanned, ${report.sequences.total} behind max(pk)`);
    for (const s of report.sequences.behind) console.log(`        ${s.table}.${s.column}: at ${s.at}, max(pk) ${s.maxPk}`);

    const rows = report.tables.reduce((n, t) => n + (t.count?.staging ?? 0), 0);
    console.log(
      report.pass
        ? `\nGATE 1 GREEN — ${report.tables.length} tables, ${rows} rows. Extraction is beyond doubt; Stage 2 may run.`
        : `\nGATE 1 FAILED — ${report.failures} issue(s). Fix the extract before touching Stage 2.`,
    );
  }
  return report.pass ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
