#!/usr/bin/env node
// V1 -> V3 migration parity gate. A green run is what justifies cutting over DNS.
//
// Ported from globaly-app-v2/migration/verify-db.mjs (live-tested V1->V2: admin_logs
// 129 vs 129, 0/129 rows differing). Four checks, same as V2:
//
//   1. count      source rows vs target rows, per mapping. Names the missing and the
//                 extra identity keys — not just a number.
//   2. content    rows joined on the identity key, normalized deep-equal over the
//                 mapped columns (timestamps -> epoch, Date -> epoch, deep JSON), so
//                 representation differences never produce a false mismatch.
//   3. fk         no child row in the target pointing at a missing parent.
//   4. sequence   every target sequence >= max(pk), so the next insert cannot collide.
//
// What is NEW vs V2: V2 diffed identically-shaped schemas by column NAME. V3
// transforms (uuid PK -> serial + preserved uuid, text country -> country_id FK,
// single DB -> per-tenant schemas, renamed columns), so every comparison is declared
// in migration-manifest.json as a pair of SQL expressions, one per side. Any source
// column not mapped and not explicitly dropped-with-a-reason is a MANIFEST ERROR.
//
// Usage:
//   node database/scripts/verify-migration.mjs                    # human report
//   node database/scripts/verify-migration.mjs --table=businesses # one mapping
//   node database/scripts/verify-migration.mjs --json             # machine output
//   node database/scripts/verify-migration.mjs --self-check       # no DB needed
//   node database/scripts/verify-migration.mjs --max-diffs=20
//   node database/scripts/verify-migration.mjs --manifest=/path/to/other.json
//
// Connections (read-only on BOTH — `SET default_transaction_read_only = on`):
//   V1_DATABASE_URL / --source-url=…      the V1 source
//   V3_DATABASE_URL / --target-url=…      the V3 target
//
// Exit 0 = green (safe to proceed), 1 = mismatch (DO NOT cut over), 2 = usage/manifest error.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = { table: null, json: false, selfCheck: false, maxDiffs: 5, manifest: null, sourceUrl: null, targetUrl: null };
  for (const arg of argv) {
    if (arg === "--json") flags.json = true;
    else if (arg === "--self-check") flags.selfCheck = true;
    else if (arg.startsWith("--table=")) flags.table = arg.slice(8);
    else if (arg.startsWith("--max-diffs=")) flags.maxDiffs = Number(arg.slice(12));
    else if (arg.startsWith("--manifest=")) flags.manifest = arg.slice(11);
    else if (arg.startsWith("--source-url=")) flags.sourceUrl = arg.slice(13);
    else if (arg.startsWith("--target-url=")) flags.targetUrl = arg.slice(13);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(flags.maxDiffs) || flags.maxDiffs < 0) throw new Error("--max-diffs must be a non-negative integer");
  return flags;
}

// ── Normalization (the reason a representation difference is not a mismatch) ──

/** Canonical, comparable form of a value read from either database. */
export function norm(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return `@${value.getTime()}`;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  if (Buffer.isBuffer(value)) return `0x${value.toString("hex")}`;
  if (typeof value === "string") {
    // ISO timestamp -> epoch, so "…Z" vs "…+00:00" vs a Date all agree.
    if (/^\d{4}-\d\d-\d\dT/.test(value)) {
      const t = Date.parse(value);
      if (!Number.isNaN(t)) return `@${t}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(norm);
  if (typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = norm(value[k]);
    return out;
  }
  return value;
}

const canon = (value) => JSON.stringify(norm(value));

// ── Manifest validation: an unlisted source column is an error, never a pass ──

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function splitQualified(table) {
  const dot = table.indexOf(".");
  if (dot < 0) throw new Error(`source table must be schema-qualified: ${table}`);
  return { schema: table.slice(0, dot), name: table.slice(dot + 1) };
}

/** Structural checks on the manifest itself. Runs with no database. */
export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || !Array.isArray(manifest.mappings) || manifest.mappings.length === 0) {
    return ["manifest has no `mappings` array"];
  }
  const seen = new Set();
  for (const m of manifest.mappings) {
    const where = `mapping ${m?.name ?? "(unnamed)"}`;
    if (!m.name) errors.push(`${where}: missing name`);
    else if (seen.has(m.name)) errors.push(`${where}: duplicate name`);
    else seen.add(m.name);

    if (!m.source?.table) errors.push(`${where}: missing source.table`);
    if (!m.source?.alias) errors.push(`${where}: missing source.alias`);
    if (!m.target?.table) errors.push(`${where}: missing target.table`);
    if (!m.target?.alias) errors.push(`${where}: missing target.alias`);
    if (!m.identity?.source || !m.identity?.target) errors.push(`${where}: identity needs both a source and a target expression`);
    if (!Array.isArray(m.columns) || m.columns.length === 0) errors.push(`${where}: needs at least one column mapping`);
    if (!Array.isArray(m.dropped)) errors.push(`${where}: needs a dropped[] array (may be empty, but must be declared)`);

    const names = new Set();
    for (const c of m.columns ?? []) {
      if (!c.name) errors.push(`${where}: a column mapping has no name`);
      else if (names.has(c.name)) errors.push(`${where}: duplicate column name ${c.name}`);
      else names.add(c.name);
      if (!c.source) errors.push(`${where}.${c.name}: missing source expression`);
      if (!c.target) errors.push(`${where}.${c.name}: missing target expression`);
      if (c.from !== null && c.from !== undefined && typeof c.from !== "string" && !Array.isArray(c.from)) {
        errors.push(`${where}.${c.name}: \`from\` must be null, a string, or an array of source column names`);
      }
    }

    const dropped = new Set();
    for (const d of m.dropped ?? []) {
      if (!d.column) errors.push(`${where}: a dropped entry has no column`);
      if (!d.reason || String(d.reason).trim().length < 10) {
        errors.push(`${where}: dropped column ${d.column} needs a real reason — "default to review, never skip"`);
      }
      if (dropped.has(d.column)) errors.push(`${where}: column ${d.column} dropped twice`);
      dropped.add(d.column);
    }
    for (const c of m.columns ?? []) {
      for (const f of froms(c)) {
        if (dropped.has(f)) errors.push(`${where}: source column ${f} is both mapped (as ${c.name}) and dropped`);
      }
    }

    const policy = m.extraTargetRows?.policy ?? "fail";
    if (!["fail", "allow"].includes(policy)) errors.push(`${where}: extraTargetRows.policy must be "fail" or "allow"`);
    if (policy === "allow") {
      if (!Number.isInteger(m.extraTargetRows.max) || m.extraTargetRows.max < 0) {
        errors.push(`${where}: extraTargetRows policy "allow" needs an integer \`max\` — an uncapped allowance is a silent skip`);
      }
      if (!m.extraTargetRows.reason) errors.push(`${where}: extraTargetRows policy "allow" needs a reason`);
    }
  }
  return errors;
}

function froms(column) {
  if (column.from === null || column.from === undefined) return [];
  return Array.isArray(column.from) ? column.from : [column.from];
}

/** Every column of source.table must be mapped or explicitly dropped. */
async function checkColumnCoverage(source, mapping) {
  const { schema, name } = splitQualified(mapping.source.table);
  const { rows } = await source.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
    [schema, name],
  );
  if (rows.length === 0) return [`source table ${mapping.source.table} does not exist`];

  const actual = new Set(rows.map((r) => r.column_name));
  const accounted = new Set();
  for (const c of mapping.columns) for (const f of froms(c)) accounted.add(f);
  for (const d of mapping.dropped) accounted.add(d.column);

  const problems = [];
  for (const col of actual) {
    if (!accounted.has(col)) {
      problems.push(`source column ${mapping.source.table}.${col} is neither mapped nor declared dropped — manifest error, not a pass`);
    }
  }
  for (const col of accounted) {
    if (!actual.has(col)) problems.push(`manifest names ${mapping.source.table}.${col}, which does not exist in the source`);
  }
  return problems;
}

// ── Query building ──────────────────────────────────────────────────────────

/** Named lookups fetched from one DB and injected as a CTE into the other's query. */
async function buildLookupCte(manifest, clients) {
  // `$`-prefixed keys are documentation, not lookups.
  const defs = Object.entries(manifest.lookups ?? {}).filter(([k]) => !k.startsWith("$"));
  if (defs.length === 0) return { source: "", target: "" };

  const parts = { source: [], target: [] };
  for (const [name, def] of defs) {
    const from = def.from === "source" ? clients.source : clients.target;
    const { rows } = await from.query(def.query);
    const cols = def.columns.map((c) => c.name);
    const values = rows.length
      ? rows
          .map((r) => `(${def.columns.map((c) => (r[c.name] === null ? `NULL::${c.type}` : `${quoteLiteral(r[c.name])}::${c.type}`)).join(", ")})`)
          .join(", ")
      : `(${def.columns.map((c) => `NULL::${c.type}`).join(", ")})`;
    const where = rows.length ? "" : " WHERE false";
    const cte = `${quoteIdent(name)}(${cols.map(quoteIdent).join(", ")}) AS (SELECT * FROM (VALUES ${values}) v(${cols.map(quoteIdent).join(", ")})${where})`;
    parts[def.injectInto].push(cte);
  }
  return {
    source: parts.source.length ? `WITH ${parts.source.join(", ")} ` : "",
    target: parts.target.length ? `WITH ${parts.target.join(", ")} ` : "",
  };
}

function buildSelect(side, identityExpr, columns, exprKey) {
  const cols = columns.map((c) => `${c[exprKey]} AS ${quoteIdent(c.name)}`);
  const joins = (side.joins ?? []).join(" ");
  const where = side.filter ? `WHERE ${side.filter}` : "";
  return `SELECT ${identityExpr} AS __key, ${cols.join(", ")} FROM ${side.table} ${side.alias} ${joins} ${where}`;
}

/** Per-tenant targets: repeat the SELECT once per schema and UNION ALL. */
function expandSchemas(sql, schemas) {
  if (!schemas) return sql;
  if (schemas.length === 0) return `SELECT NULL::text AS __key WHERE false`;
  return schemas.map((s) => sql.replaceAll("{{schema}}", String(s).replace(/"/g, '""'))).join(" UNION ALL ");
}

async function fetchSide(client, cte, sql) {
  const { rows } = await client.query(`${cte}${sql}`);
  const byKey = new Map();
  const duplicates = [];
  for (const row of rows) {
    const key = row.__key === null ? "(null)" : String(row.__key);
    if (byKey.has(key)) duplicates.push(key);
    else byKey.set(key, row);
  }
  return { rows, byKey, duplicates };
}

// ── Check 1 + 2: count and content parity, per mapping ──────────────────────

async function verifyMapping(mapping, clients, ctes, maxDiffs) {
  const result = {
    name: mapping.name,
    source: mapping.source.table,
    target: mapping.target.table,
    identity: mapping.identity.label ?? mapping.identity.source,
    checks: {},
    errors: [],
  };

  const coverage = await checkColumnCoverage(clients.source, mapping);
  result.checks.coverage = { pass: coverage.length === 0, problems: coverage };
  if (coverage.length) {
    result.errors.push(...coverage);
    return result;
  }

  const sourceSql = buildSelect(mapping.source, mapping.identity.source, mapping.columns, "source");
  let targetSql = buildSelect(
    { ...mapping.target, joins: mapping.target.joins },
    mapping.identity.target,
    mapping.columns,
    "target",
  );

  let schemas = null;
  if (mapping.target.schemaExpand) {
    const { rows } = await clients.target.query(mapping.target.schemaExpand);
    schemas = rows.map((r) => r.schema ?? Object.values(r)[0]);
    targetSql = expandSchemas(targetSql, schemas);
    result.tenantSchemas = schemas.length;
  }

  const src = await fetchSide(clients.source, ctes.source, sourceSql);
  const tgt = await fetchSide(clients.target, ctes.target, targetSql);

  // ── Check 1: count ──
  const missing = [...src.byKey.keys()].filter((k) => !tgt.byKey.has(k));
  const extra = [...tgt.byKey.keys()].filter((k) => !src.byKey.has(k));
  const policy = mapping.extraTargetRows?.policy ?? "fail";
  const allowance = policy === "allow" ? mapping.extraTargetRows.max : 0;
  const extraAllowed = policy === "allow" && extra.length <= allowance;

  result.checks.count = {
    pass: missing.length === 0 && (extra.length === 0 || extraAllowed) && src.duplicates.length === 0 && tgt.duplicates.length === 0,
    sourceRows: src.rows.length,
    targetRows: tgt.rows.length,
    matched: src.rows.length - missing.length,
    missing: missing.slice(0, maxDiffs),
    missingTotal: missing.length,
    extra: extra.slice(0, maxDiffs),
    extraTotal: extra.length,
    extraAllowance: policy === "allow" ? { max: allowance, reason: mapping.extraTargetRows.reason } : null,
    duplicateSourceKeys: src.duplicates.slice(0, maxDiffs),
    duplicateTargetKeys: tgt.duplicates.slice(0, maxDiffs),
  };

  // ── Check 2: content ──
  const diffs = [];
  let differingRows = 0;
  for (const [key, sourceRow] of src.byKey) {
    const targetRow = tgt.byKey.get(key);
    if (!targetRow) continue; // already reported by the count check
    const rowDiffs = [];
    for (const c of mapping.columns) {
      const expected = canon(sourceRow[c.name]);
      const actual = canon(targetRow[c.name]);
      if (expected !== actual) rowDiffs.push({ column: c.name, expected: JSON.parse(expected), actual: JSON.parse(actual) });
    }
    if (rowDiffs.length) {
      differingRows += 1;
      if (diffs.length < maxDiffs) diffs.push({ key, columns: rowDiffs });
    }
  }
  result.checks.content = {
    pass: differingRows === 0,
    comparedRows: src.byKey.size - missing.length,
    comparedColumns: mapping.columns.length,
    differingRows,
    samples: diffs,
  };

  return result;
}

// ── Check 3: FK orphans in the target ───────────────────────────────────────

async function scanForeignKeys(target, schemas, maxDiffs) {
  const { rows: constraints } = await target.query(
    `SELECT c.conname,
            n.nspname                       AS child_schema,
            c.conrelid::regclass::text      AS child,
            c.confrelid::regclass::text     AS parent,
            pg_get_constraintdef(c.oid)     AS def
       FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND ($1::text[] IS NULL OR n.nspname = ANY($1))
      ORDER BY n.nspname, c.conname`,
    [schemas && schemas.length ? schemas : null],
  );

  const violations = [];
  for (const fk of constraints) {
    const m = fk.def.match(/FOREIGN KEY \(([^)]+)\) REFERENCES (.+)\(([^)]+)\)/i);
    if (!m) {
      violations.push({ constraint: fk.conname, child: fk.child, error: `unparseable constraint: ${fk.def}` });
      continue;
    }
    const childCols = m[1].split(",").map((s) => s.trim());
    const parent = m[2].trim();
    const parentCols = m[3].split(",").map((s) => s.trim());
    const join = childCols.map((c, i) => `p.${parentCols[i]} = c.${c}`).join(" AND ");
    const notNull = childCols.map((c) => `c.${c} IS NOT NULL`).join(" AND ");
    const { rows } = await target.query(
      `SELECT count(*)::int AS n FROM ${fk.child} c WHERE ${notNull} AND NOT EXISTS (SELECT 1 FROM ${parent} p WHERE ${join})`,
    );
    if (rows[0].n > 0) {
      violations.push({ constraint: fk.conname, child: fk.child, parent, columns: childCols, orphans: rows[0].n });
    }
  }
  return {
    pass: violations.length === 0,
    constraintsScanned: constraints.length,
    violations: violations.slice(0, maxDiffs),
    violationsTotal: violations.length,
  };
}

// ── Check 4: sequence health in the target ──────────────────────────────────

async function scanSequences(target, schemas, maxDiffs) {
  const { rows: serials } = await target.query(
    `SELECT n.nspname AS schema, c.relname AS tbl, a.attname AS col,
            pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) AS seq
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND ($1::text[] IS NULL OR n.nspname = ANY($1))
        AND pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) IS NOT NULL
      ORDER BY n.nspname, c.relname, a.attname`,
    [schemas && schemas.length ? schemas : null],
  );

  const behind = [];
  for (const s of serials) {
    const { rows } = await target.query(
      `SELECT (SELECT coalesce(max(${quoteIdent(s.col)}), 0) FROM ${quoteIdent(s.schema)}.${quoteIdent(s.tbl)}) AS max_pk,
              (SELECT last_value - CASE WHEN is_called THEN 0 ELSE 1 END FROM ${s.seq}) AS next_minus_one`,
    );
    const maxPk = Number(rows[0].max_pk);
    const seqAt = Number(rows[0].next_minus_one);
    if (seqAt < maxPk) {
      behind.push({ sequence: s.seq, table: `${s.schema}.${s.tbl}`, column: s.col, sequenceAt: seqAt, maxPk });
    }
  }
  return {
    pass: behind.length === 0,
    sequencesScanned: serials.length,
    behind: behind.slice(0, maxDiffs),
    behindTotal: behind.length,
  };
}

// ── Reporting ───────────────────────────────────────────────────────────────

function printReport(report) {
  const line = (s = "") => console.log(s);
  line(`V1 -> V3 migration parity gate`);
  line(`  manifest : ${report.manifest}`);
  line(`  source   : ${report.sourceLabel}`);
  line(`  target   : ${report.targetLabel}`);
  line();

  for (const m of report.mappings) {
    const ok = Object.values(m.checks).every((c) => c.pass);
    line(`${ok ? "PASS" : "FAIL"}  ${m.name}`);
    line(`      ${m.source} -> ${m.target}${m.tenantSchemas ? ` (${m.tenantSchemas} tenant schemas)` : ""}`);
    line(`      identity: ${m.identity}`);

    if (m.checks.coverage && !m.checks.coverage.pass) {
      for (const p of m.checks.coverage.problems) line(`      [coverage] ${p}`);
      line();
      continue;
    }

    const c = m.checks.count;
    line(`      [count]   source=${c.sourceRows} target=${c.targetRows} matched=${c.matched}  ${c.pass ? "ok" : "MISMATCH"}`);
    if (c.missingTotal) {
      line(`        missing in target (${c.missingTotal}): ${c.missing.join(", ")}${c.missingTotal > c.missing.length ? ", …" : ""}`);
    }
    if (c.extraTotal) {
      const verdict = c.extraAllowance && c.extraTotal <= c.extraAllowance.max ? `allowed, max ${c.extraAllowance.max}` : "NOT ALLOWED";
      line(`        extra in target (${c.extraTotal}, ${verdict}): ${c.extra.join(", ")}${c.extraTotal > c.extra.length ? ", …" : ""}`);
      if (c.extraAllowance) line(`          reason: ${c.extraAllowance.reason}`);
    }
    if (c.duplicateSourceKeys.length) line(`        duplicate SOURCE identity keys: ${c.duplicateSourceKeys.join(", ")}`);
    if (c.duplicateTargetKeys.length) line(`        duplicate TARGET identity keys: ${c.duplicateTargetKeys.join(", ")}`);

    const ct = m.checks.content;
    line(`      [content] ${ct.comparedRows} rows x ${ct.comparedColumns} mapped columns, ${ct.differingRows} differing  ${ct.pass ? "ok" : "MISMATCH"}`);
    for (const d of ct.samples) {
      line(`        row ${d.key}`);
      for (const col of d.columns) {
        line(`          ${col.column}: expected ${JSON.stringify(col.expected)} — actual ${JSON.stringify(col.actual)}`);
      }
    }
    line();
  }

  const fk = report.fk;
  line(`${fk.pass ? "PASS" : "FAIL"}  fk-orphans   ${fk.constraintsScanned} constraints scanned, ${fk.violationsTotal} violated`);
  for (const v of fk.violations) {
    line(`      ${v.error ?? `${v.constraint}: ${v.orphans} orphan(s) in ${v.child}(${v.columns.join(",")}) -> ${v.parent}`}`);
  }

  const seq = report.sequences;
  line(`${seq.pass ? "PASS" : "FAIL"}  sequences    ${seq.sequencesScanned} scanned, ${seq.behindTotal} behind max(pk)`);
  for (const s of seq.behind) {
    line(`      ${s.table}.${s.column}: sequence at ${s.sequenceAt}, max(pk) ${s.maxPk} — the next insert would collide`);
  }

  line();
  line(
    report.pass
      ? `PARITY GREEN — ${report.mappings.length} mapping(s) match. Safe to proceed.`
      : `PARITY FAILED — ${report.failures} issue(s). DO NOT cut over.`,
  );
}

// ── Self-check: manifest + normalizer, no database required ─────────────────

function selfCheck(manifest, manifestPath) {
  assert.equal(norm(null), null);
  assert.equal(norm(undefined), null);
  assert.equal(norm(new Date("2020-01-02T03:04:05Z")), "@1577934245000");
  assert.equal(norm("2020-01-02T03:04:05Z"), "@1577934245000");
  assert.equal(norm("2020-01-02T03:04:05.000+00:00"), "@1577934245000");
  // Same instant, three representations -> one canonical form.
  assert.equal(canon(new Date("2020-01-02T03:04:05Z")), canon("2020-01-02T03:04:05.000+00:00"));
  // A plain date is NOT a timestamp; it stays a string.
  assert.equal(norm("2020-01-02"), "2020-01-02");
  // Object key order is not a difference.
  assert.equal(canon({ b: 1, a: 2 }), canon({ a: 2, b: 1 }));
  // …but a value difference still is.
  assert.notEqual(canon({ a: 1 }), canon({ a: 2 }));
  assert.equal(canon([1, "x", null]), canon([1, "x", null]));
  assert.notEqual(canon(1), canon("1"));

  const errors = validateManifest(manifest);
  assert.deepEqual(errors, [], `manifest errors:\n  ${errors.join("\n  ")}`);

  // A manifest that hides a column behind an uncapped allowance must be rejected.
  const bad = {
    mappings: [
      {
        name: "x",
        source: { table: "a.b", alias: "s" },
        target: { table: "c.d", alias: "t" },
        identity: { source: "s.id", target: "t.id" },
        columns: [{ name: "c", from: "c", source: "s.c", target: "t.c" }],
        dropped: [{ column: "c", reason: "contradicts the mapping above" }],
        extraTargetRows: { policy: "allow" },
      },
    ],
  };
  const badErrors = validateManifest(bad);
  assert.ok(badErrors.some((e) => e.includes("both mapped")), "must reject a column that is mapped and dropped");
  assert.ok(badErrors.some((e) => e.includes("needs an integer")), "must reject an uncapped extra-row allowance");

  console.log(`self-check: ok — ${manifest.mappings.length} mapping(s) in ${manifestPath} are well-formed`);
  for (const m of manifest.mappings) {
    console.log(`  ${m.name}: ${m.columns.length} compared, ${m.dropped.length} declared dropped`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function connect(url, label) {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`${label}: cannot connect — ${err.message}`);
  }
  // Read-only at the transaction level: this script physically cannot write.
  await client.query("SET default_transaction_read_only = on");
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

  const manifestPath = flags.manifest ? path.resolve(flags.manifest) : path.join(HERE, "migration-manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    console.error(`cannot read manifest ${manifestPath}: ${err.message}`);
    return 2;
  }

  if (flags.selfCheck) {
    try {
      selfCheck(manifest, manifestPath);
      return 0;
    } catch (err) {
      console.error(`self-check FAILED: ${err.message}`);
      return 2;
    }
  }

  const manifestErrors = validateManifest(manifest);
  if (manifestErrors.length) {
    console.error(`manifest ${manifestPath} is invalid:`);
    for (const e of manifestErrors) console.error(`  ${e}`);
    return 2;
  }

  const sourceUrl = flags.sourceUrl || process.env.V1_DATABASE_URL;
  const targetUrl = flags.targetUrl || process.env.V3_DATABASE_URL;
  if (!sourceUrl || !targetUrl) {
    console.error("set V1_DATABASE_URL and V3_DATABASE_URL (or pass --source-url= / --target-url=)");
    return 2;
  }

  let mappings = manifest.mappings;
  if (flags.table) {
    mappings = mappings.filter((m) => m.name === flags.table);
    if (mappings.length === 0) {
      console.error(`no mapping named "${flags.table}". Available: ${manifest.mappings.map((m) => m.name).join(", ")}`);
      return 2;
    }
  }

  const clients = { source: await connect(sourceUrl, "source (V1)"), target: await connect(targetUrl, "target (V3)") };
  const report = {
    manifest: manifestPath,
    sourceLabel: redact(sourceUrl),
    targetLabel: redact(targetUrl),
    mappings: [],
    fk: null,
    sequences: null,
    pass: false,
    failures: 0,
  };

  try {
    const ctes = await buildLookupCte(manifest, clients);
    for (const m of mappings) {
      try {
        report.mappings.push(await verifyMapping(m, clients, ctes, flags.maxDiffs));
      } catch (err) {
        report.mappings.push({
          name: m.name,
          source: m.source.table,
          target: m.target.table,
          identity: m.identity?.label ?? "",
          checks: { error: { pass: false, message: String(err.message || err).split("\n")[0] } },
          errors: [String(err.message || err)],
        });
      }
    }
    const schemas = manifest.structural?.schemas ?? [];
    report.fk = await scanForeignKeys(clients.target, schemas, flags.maxDiffs);
    report.sequences = await scanSequences(clients.target, schemas, flags.maxDiffs);
  } finally {
    await clients.source.end().catch(() => {});
    await clients.target.end().catch(() => {});
  }

  report.failures =
    report.mappings.reduce((n, m) => n + Object.values(m.checks).filter((c) => !c.pass).length, 0) +
    (report.fk.pass ? 0 : 1) +
    (report.sequences.pass ? 0 : 1);
  report.pass = report.failures === 0;

  if (flags.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);

  return report.pass ? 0 : 1;
}

process.exit(await main());
