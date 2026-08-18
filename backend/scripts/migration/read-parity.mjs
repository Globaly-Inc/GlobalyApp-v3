#!/usr/bin/env node
// GATE 3 — read parity. Ported from V2's migration/read-parity.mjs.
//
// Gate 1 proved EXTRACTION (V1 -> v1_staging). Gate 2 proved TRANSFORM
// (v1_staging -> V3 shape). This gate proves the READ LAYER: every item a V3
// *public* (no-JWT) endpoint hands an anonymous visitor traces back to a
// migrated source row. Chained, the three gates cover the whole path from a V1
// table to a browser.
//
// What is kept from V2, and why:
//
//   per-item trace   Each returned item is looked up in its source table by id
//                    and its stable fields deep-compared. This is the check
//                    that survives reshaping, sorting and pagination.
//
//   no exact counts  Rehearsal-2 lesson: `countSql` is only sound on an
//                    UNFILTERED endpoint. Here that is structural, not a
//                    comment — every entry must declare `filtered`, and
//                    validateEntry() REJECTS a corpus that puts a count on a
//                    filtered one. A brittle count cannot be written by
//                    accident.
//
// What V3 needed that V2 did not:
//
//   schema-per-tenant  V2 hardcoded public."<table>". V3 keeps master data in
//                      `public`, admin data in `superadmin`, and tenant data in
//                      a schema named by the tenant's RAW UUID. An entry
//                      therefore declares its schema, or a `schemaResolver`
//                      (a mig.* resolver view holding schema_name) that is
//                      consulted PER ITEM. Tenant schema names are never
//                      guessed from a prefix — mig is the only authority.
//
//   provenance         A row existing is not the same as a row being migrated.
//                      `provenance` is an SQL expression that must be non-null
//                      on the source row (v1_id, meta->>'v1_business_id', …),
//                      so a V3-native row cannot silently satisfy the trace.
//
//   non-vacuous        An endpoint that returns zero items traces zero items
//                      and would pass. `minItems` (default 1) closes that.
//                      A gate that a broken endpoint passes is not a gate.
//
// Endpoints returning data that was never migrated (seeded reference data,
// V3-only tables) are declared `"traces": false` with a mandatory note. They
// are still fetched — a 500 is a read-layer failure either way — but no false
// trace is manufactured for them.
//
// Usage:
//   node scripts/migration/read-parity.mjs                 # dry run (default)
//   node scripts/migration/read-parity.mjs --self-check
//   node scripts/migration/read-parity.mjs --run --api-url=http://localhost:3000 --target-url=…
//   node scripts/migration/read-parity.mjs --run --entries=catalog-services,geo-countries
//
// Exit 0 green · 1 mismatch · 2 usage/config error.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { canon } from "./normalize.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = path.join(HERE, "read-parity", "corpus.json");

const LITERAL_SCHEMAS = new Set(["public", "superadmin", "v1_staging"]);

// ── CLI ─────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const flags = {
    selfCheck: false,
    json: false,
    run: false,
    apiUrl: null,
    targetUrl: null,
    entries: null,
    corpus: null,
  };
  for (const arg of argv) {
    if (arg === "--self-check") flags.selfCheck = true;
    else if (arg === "--json") flags.json = true;
    else if (arg === "--run") flags.run = true;
    else if (arg === "--dry-run") flags.run = false;
    else if (arg.startsWith("--api-url=")) flags.apiUrl = arg.slice(10).replace(/\/+$/, "");
    else if (arg.startsWith("--target-url=")) flags.targetUrl = arg.slice(13);
    else if (arg.startsWith("--entries=")) flags.entries = arg.slice(10).split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg.startsWith("--corpus=")) flags.corpus = arg.slice(9);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return flags;
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/** A Postgres identifier, quoted. Rejects the only character that could escape it. */
export function quoteIdent(name) {
  if (typeof name !== "string" || name.length === 0) throw new Error(`bad identifier: ${JSON.stringify(name)}`);
  if (name.includes('"')) throw new Error(`bad identifier: ${name}`);
  return `"${name}"`;
}

/** schema.table, both quoted. Tenant schemas are raw UUIDs, so quoting is mandatory. */
export function qualify(schema, table) {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}

/**
 * Structural validation of one corpus entry.
 *
 * This is where the rehearsal-2 lesson lives. `count` on a filtered or
 * paginated endpoint is the brittle check that wasted rehearsal 2, so it is
 * rejected here rather than discouraged in prose.
 */
export function validateEntry(entry) {
  const where = `entry ${entry?.name ?? "<unnamed>"}`;
  if (!entry || typeof entry !== "object") throw new Error("corpus entry must be an object");
  for (const k of ["name", "path"]) if (typeof entry[k] !== "string" || !entry[k]) throw new Error(`${where}: '${k}' is required`);
  if (typeof entry.filtered !== "boolean") throw new Error(`${where}: 'filtered' must be declared true or false`);
  if (entry.count !== undefined) {
    if (entry.filtered) throw new Error(`${where}: exact counts are not allowed on a filtered/paginated endpoint (rehearsal-2 lesson)`);
    if (typeof entry.count?.sql !== "string") throw new Error(`${where}: 'count.sql' must be a string`);
  }

  const traces = entry.traces !== false;
  if (!traces) {
    if (typeof entry.note !== "string" || entry.note.length < 10)
      throw new Error(`${where}: a non-tracing entry must carry a note saying why the data is not migrated`);
    return entry;
  }

  if (typeof entry.idField !== "string" || !entry.idField) throw new Error(`${where}: 'idField' is required`);
  const t = entry.trace;
  if (!t || typeof t !== "object") throw new Error(`${where}: 'trace' is required unless traces is false`);
  if (typeof t.table !== "string" || !t.table) throw new Error(`${where}: 'trace.table' is required`);
  if (typeof t.idColumn !== "string" || !t.idColumn) throw new Error(`${where}: 'trace.idColumn' is required`);

  const hasSchema = typeof t.schema === "string";
  const hasResolver = t.schemaResolver !== undefined;
  if (hasSchema === hasResolver) throw new Error(`${where}: declare exactly one of 'trace.schema' or 'trace.schemaResolver'`);
  if (hasSchema && !LITERAL_SCHEMAS.has(t.schema))
    throw new Error(`${where}: literal schema must be one of ${[...LITERAL_SCHEMAS].join(", ")} — tenant schemas are raw UUIDs and must come from a resolver`);
  if (hasResolver) {
    const r = t.schemaResolver;
    for (const k of ["table", "idColumn", "schemaColumn"]) if (typeof r?.[k] !== "string" || !r[k]) throw new Error(`${where}: 'trace.schemaResolver.${k}' is required`);
    if (!r.table.startsWith("mig.")) throw new Error(`${where}: the tenant schema resolver must be a mig.* table — schema names are never guessed from a prefix`);
  }

  if (!entry.compareFields || typeof entry.compareFields !== "object" || Object.keys(entry.compareFields).length === 0)
    throw new Error(`${where}: 'compareFields' must map at least one item field to a source column`);
  for (const col of Object.values(entry.compareFields)) quoteIdent(col);

  if (entry.minItems !== undefined && (!Number.isInteger(entry.minItems) || entry.minItems < 0))
    throw new Error(`${where}: 'minItems' must be a non-negative integer`);
  return entry;
}

export function loadCorpus(file = CORPUS_PATH) {
  const corpus = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(corpus.entries)) throw new Error("corpus: 'entries' must be an array");
  const seen = new Set();
  for (const e of corpus.entries) {
    validateEntry(e);
    if (seen.has(e.name)) throw new Error(`corpus: duplicate entry name ${e.name}`);
    seen.add(e.name);
  }
  return corpus;
}

/** Dig `a.b.c` out of a response body. Returns undefined rather than throwing. */
export function pickItems(body, itemsPath) {
  const picked = itemsPath ? itemsPath.split(".").reduce((o, k) => (o == null ? o : o[k]), body) : body;
  if (picked == null) return undefined;
  return Array.isArray(picked) ? picked : [picked];
}

/** Item fields that disagree with the source row. Empty means the item traces cleanly. */
export function fieldDiff(item, row, compareFields) {
  const bad = [];
  for (const [itemField, sourceColumn] of Object.entries(compareFields)) {
    if (canon(item[itemField]) !== canon(row[sourceColumn])) bad.push(itemField);
  }
  return bad;
}

/** How many items an entry must return before its per-item trace means anything. */
export function requiredItems(entry) {
  if (entry.traces === false) return entry.minItems ?? 0;
  return entry.minItems ?? 1;
}

// ── Runtime ─────────────────────────────────────────────────────────────────

/** Per-item tenant schema, straight out of the mig resolver. Never inferred. */
async function resolveSchemas(db, resolver, ids) {
  const { rows } = await db.query(
    `SELECT ${quoteIdent(resolver.idColumn)}::text AS id, ${quoteIdent(resolver.schemaColumn)}::text AS schema
       FROM ${resolver.table.split(".").map(quoteIdent).join(".")}
      WHERE ${quoteIdent(resolver.idColumn)}::text = ANY($1::text[])`,
    [ids],
  );
  return new Map(rows.map((r) => [r.id, r.schema]));
}

async function sourceRow(db, schema, trace, id) {
  const cols = new Set(Object.values(trace.selectColumns));
  const select = [...cols].map(quoteIdent).join(", ");
  const prov = trace.provenance ? `, (${trace.provenance}) AS __provenance` : "";
  const { rows } = await db.query(
    `SELECT ${select}${prov} FROM ${qualify(schema, trace.table)} WHERE ${quoteIdent(trace.idColumn)}::text = $1 LIMIT 1`,
    [String(id)],
  );
  return rows[0] ?? null;
}

/**
 * One corpus entry, end to end. `fetchImpl` is injected so the seeded-mismatch
 * fixture can drive the harness without a deployed API.
 */
export async function runEntry(entry, { apiUrl, db, fetchImpl = fetch }) {
  const result = { name: entry.name, path: entry.path, items: 0, failures: [] };
  const fail = (m) => result.failures.push(m);

  let res;
  try {
    res = await fetchImpl(`${apiUrl}${entry.path}`, { headers: { accept: "application/json" } });
  } catch (err) {
    fail(`endpoint unreachable — ${String(err.message || err).split("\n")[0]}`);
    return result;
  }
  if (!res.ok) {
    fail(`endpoint HTTP ${res.status}`);
    return result;
  }
  const body = await res.json();
  const items = pickItems(body, entry.itemsPath ?? null);
  if (!Array.isArray(items)) {
    fail(`itemsPath '${entry.itemsPath ?? "<body>"}' is not an array or object`);
    return result;
  }
  result.items = items.length;

  const need = requiredItems(entry);
  if (items.length < need) fail(`returned ${items.length} item(s), need >= ${need} — a trace over nothing proves nothing`);

  if (entry.count) {
    const { rows: [row] } = await db.query(entry.count.sql);
    const expected = Number(Object.values(row)[0]);
    if (expected !== items.length) fail(`count endpoint=${items.length} source=${expected}`);
  }

  if (entry.traces === false) return result;

  const trace = { ...entry.trace, selectColumns: entry.compareFields };
  const ids = items.map((it) => (it?.[entry.idField] == null ? null : String(it[entry.idField])));
  const missingId = ids.filter((v) => v === null).length;
  if (missingId) fail(`${missingId} item(s) carry no '${entry.idField}'`);

  const schemas = trace.schemaResolver
    ? await resolveSchemas(db, trace.schemaResolver, ids.filter(Boolean))
    : null;

  let unresolved = 0, missing = 0, unmigrated = 0;
  const drift = [];
  for (const [i, item] of items.entries()) {
    const id = ids[i];
    if (id === null) continue;
    const schema = schemas ? schemas.get(id) : trace.schema;
    if (!schema) { unresolved++; continue; }
    const row = await sourceRow(db, schema, trace, id);
    if (!row) { missing++; continue; }
    if (trace.provenance && row.__provenance == null) { unmigrated++; continue; }
    const bad = fieldDiff(item, row, entry.compareFields);
    if (bad.length && drift.length < 5) drift.push({ id, fields: bad });
    else if (bad.length) drift.push({ id, fields: bad, elided: true });
  }

  if (unresolved) fail(`${unresolved} item(s) have no ${trace.schemaResolver.table} entry — no tenant schema, no trace`);
  if (missing) fail(`${missing} item(s) absent from ${trace.schemaResolver ? "<tenant>" : trace.schema}.${trace.table}`);
  if (unmigrated) fail(`${unmigrated} item(s) trace to a row with no provenance (${trace.provenance}) — not migrated data`);
  if (drift.length) fail(`${drift.length} item(s) drift from source: ` + drift.filter((d) => !d.elided).map((d) => `${d.id}[${d.fields.join(",")}]`).join(" "));
  return result;
}

// ── Self-check ──────────────────────────────────────────────────────────────

function selfCheck() {
  // Argument handling.
  assert.deepEqual(parseArgs(["--self-check"]).selfCheck, true);
  assert.equal(parseArgs([]).run, false, "dry run is the default");
  assert.equal(parseArgs(["--run"]).run, true);
  assert.equal(parseArgs(["--api-url=http://x/"]).apiUrl, "http://x");
  assert.throws(() => parseArgs(["--nope"]), /unknown argument/);

  // Identifiers. Tenant schemas are raw UUIDs — unquoted they are a syntax error.
  assert.equal(qualify("032e873c-9502-496d-8441-41119cbe65ab", "business_services"), '"032e873c-9502-496d-8441-41119cbe65ab"."business_services"');
  assert.throws(() => quoteIdent('a"b'), /bad identifier/);

  const base = {
    name: "e", path: "/p", filtered: true, idField: "id",
    trace: { schema: "public", table: "t", idColumn: "id" },
    compareFields: { name: "name" },
  };
  assert.ok(validateEntry({ ...base }));

  // THE rehearsal-2 lesson, structural.
  assert.throws(() => validateEntry({ ...base, count: { sql: "select 1" } }), /not allowed on a filtered/);
  assert.ok(validateEntry({ ...base, filtered: false, count: { sql: "select 1" } }));
  assert.throws(() => validateEntry({ ...base, filtered: undefined }), /'filtered' must be declared/);

  // Schema declaration: exactly one, and a tenant schema only ever via mig.
  assert.throws(() => validateEntry({ ...base, trace: { table: "t", idColumn: "id" } }), /exactly one/);
  assert.throws(
    () => validateEntry({ ...base, trace: { schema: "public", table: "t", idColumn: "id", schemaResolver: { table: "mig.m", idColumn: "id", schemaColumn: "s" } } }),
    /exactly one/,
  );
  assert.throws(() => validateEntry({ ...base, trace: { schema: "business_abc", table: "t", idColumn: "id" } }), /literal schema must be one of/);
  assert.throws(
    () => validateEntry({ ...base, trace: { table: "t", idColumn: "id", schemaResolver: { table: "public.guess", idColumn: "id", schemaColumn: "s" } } }),
    /must be a mig\.\* table/,
  );
  assert.ok(validateEntry({ ...base, trace: { table: "business_services", idColumn: "id", schemaResolver: { table: "mig.map_services", idColumn: "id", schemaColumn: "schema_name" } } }));

  // A non-tracing entry must say why.
  assert.throws(() => validateEntry({ name: "n", path: "/p", filtered: true, traces: false }), /must carry a note/);
  assert.ok(validateEntry({ name: "n", path: "/p", filtered: true, traces: false, note: "seeded reference data, no V1 source" }));

  // Vacuous traces are failures, not passes.
  assert.equal(requiredItems(base), 1);
  assert.equal(requiredItems({ ...base, traces: false }), 0);

  // Item extraction and comparison.
  assert.deepEqual(pickItems({ data: { items: [1, 2] } }, "data.items"), [1, 2]);
  assert.deepEqual(pickItems({ data: { id: 1 } }, "data"), [{ id: 1 }]);
  assert.equal(pickItems({}, "a.b"), undefined);
  assert.deepEqual(fieldDiff({ a: 1, b: "x" }, { a: 1, b: "x" }, { a: "a", b: "b" }), []);
  assert.deepEqual(fieldDiff({ a: 1 }, { a: 2 }, { a: "a" }), ["a"]);
  // A timestamp in two representations is not drift (same rule as Gate 1).
  assert.deepEqual(fieldDiff({ t: "2020-01-02T03:04:05Z" }, { t: new Date("2020-01-02T03:04:05Z") }, { t: "t" }), []);
  // …but a renamed item field is.
  assert.deepEqual(fieldDiff({ title: "a" }, { name: "b" }, { title: "name" }), ["title"]);

  const corpus = loadCorpus();
  const tracing = corpus.entries.filter((e) => e.traces !== false);
  assert.ok(corpus.entries.length > 0, "corpus must not be empty");
  assert.ok(tracing.length > 0, "a corpus with no tracing entry proves nothing");
  console.log(`self-check: ok — Gate 3 covers ${corpus.entries.length} public endpoints (${tracing.length} tracing to migrated source rows)`);
}

// ── Main ────────────────────────────────────────────────────────────────────

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

  let corpus;
  try {
    corpus = loadCorpus(flags.corpus || CORPUS_PATH);
  } catch (err) {
    console.error(`corpus: ${err.message}`);
    return 2;
  }
  let entries = corpus.entries;
  if (flags.entries) {
    const wanted = new Set(flags.entries);
    entries = entries.filter((e) => wanted.has(e.name));
    if (entries.length === 0) {
      console.error("--entries matched nothing");
      return 2;
    }
  }

  if (!flags.run) {
    console.log(`GATE 3 — read parity · DRY RUN · ${entries.length} entries\n`);
    for (const e of entries) {
      const src = e.traces === false
        ? "(not migrated — no trace)"
        : e.trace.schemaResolver
          ? `<tenant via ${e.trace.schemaResolver.table}>.${e.trace.table}.${e.trace.idColumn}`
          : `${e.trace.schema}.${e.trace.table}.${e.trace.idColumn}`;
      console.log(`  ${e.name}\n      GET ${e.path}`);
      console.log(`      -> ${src}${e.compareFields ? ` [${Object.keys(e.compareFields).join(",")}]` : ""}${e.count ? " +count" : ""}${e.filtered ? " (filtered)" : ""}`);
      if (e.note) console.log(`      note: ${e.note}`);
    }
    console.log(`\nPass --run --api-url=… --target-url=… to execute (needs the API up and the DB loaded).`);
    return 0;
  }

  const apiUrl = flags.apiUrl || process.env.V3_API_URL;
  const targetUrl = flags.targetUrl || process.env.V3_DATABASE_URL;
  if (!apiUrl) {
    console.error("no API: set --api-url= / V3_API_URL");
    return 2;
  }
  if (!targetUrl) {
    console.error("no database: set --target-url= / V3_DATABASE_URL");
    return 2;
  }

  const db = new pg.Client({ connectionString: targetUrl });
  try {
    await db.connect();
  } catch (err) {
    console.error(`target: cannot connect — ${err.message}`);
    return 2;
  }
  await db.query("SET default_transaction_read_only = on");

  const report = { api: apiUrl, target: redact(targetUrl), entries: [], failures: 0, pass: false };
  try {
    for (const entry of entries) {
      try {
        report.entries.push(await runEntry(entry, { apiUrl, db, fetchImpl: fetch }));
      } catch (err) {
        report.entries.push({ name: entry.name, path: entry.path, items: 0, failures: [String(err.message || err).split("\n")[0]] });
      }
    }
  } finally {
    await db.end().catch(() => {});
  }

  report.failures = report.entries.reduce((n, e) => n + e.failures.length, 0);
  report.pass = report.failures === 0;

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`GATE 3 — read parity`);
    console.log(`  api    : ${report.api}`);
    console.log(`  target : ${report.target}\n`);
    for (const e of report.entries) {
      console.log(`${e.failures.length ? "FAIL" : "ok  "}  ${e.name}: ${e.items} item(s)`);
      for (const f of e.failures) console.log(`        ${f}`);
    }
    const traced = report.entries.reduce((n, e) => n + e.items, 0);
    console.log(
      report.pass
        ? `\nGATE 3 GREEN — ${report.entries.length} public endpoints, ${traced} items, every one tracing to a migrated source row.`
        : `\nGATE 3 FAILED — ${report.failures} issue(s). The read layer does not surface the migrated data.`,
    );
  }
  return report.pass ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
