#!/usr/bin/env node
// GATE 2 - the V1 -> V3 migration parity gate (Part 3 §3). A green run is what
// justifies cutting over DNS.
//
// Descended from globaly-app-v2/migration/verify-db.mjs (live-tested V1->V2:
// admin_logs 129 vs 129, 0/129 rows differing). V2 diffed identically-shaped
// schemas by column NAME. V3 reshapes - uuid PK -> serial with the uuid preserved,
// free-text country -> country_id FK, one database -> per-tenant schemas, renamed
// columns - so every comparison is DECLARED in mapping.json as a pair of SQL
// expressions, one per side, and the engine stays generic.
//
// SIX CHECKS, per Part 3 §3:
//
//   1. count reconciliation  staging rows == target rows attributable to this
//                            migration + rows in the reason-coded skip report.
//                            Exact, by arithmetic. Names the missing and the extra
//                            identity keys, not just a number. Coverage is
//                            arithmetic, not memory.
//   2. content spot-parity   rows joined on the natural key, normalized deep-equal
//                            over the mapped columns. Above 10k rows a DETERMINISTIC
//                            sample (md5 of the identity, identical on both sides)
//                            keeps the gate fast without making it lucky.
//   3. fk orphans            no child row in any touched V3 schema pointing at a
//                            missing parent.
//   4. sequences             every target sequence >= max(pk), so the next insert
//                            cannot collide.
//   5. junction guard        every junction mapping declares its two parent
//                            mappings, and BOTH must reconcile before the junction
//                            is trusted (defect D8: ON CONFLICT DO NOTHING turns an
//                            ordering bug into a silent orphan).
//   6. report explained      every row in mig.unresolved carries a reason from the
//                            closed enum in mapping.json. An unknown reason is a RED
//                            gate: "unexplained" is what silent data loss looks like
//                            in a report.
//
// Plus the column-coverage rule that gates every mapping and already caught 24
// silently-unwritten columns: each column of source.table must be mapped or
// explicitly dropped WITH A REASON. An unlisted source column is a manifest error,
// never a pass.
//
// Usage:
//   node database/scripts/verify-migration.mjs                     # human report
//   node database/scripts/verify-migration.mjs --table=businesses  # one mapping
//   node database/scripts/verify-migration.mjs --json              # machine output
//   node database/scripts/verify-migration.mjs --self-check        # no DB needed
//   node database/scripts/verify-migration.mjs --max-diffs=20
//   node database/scripts/verify-migration.mjs --sample-above=10000
//   node database/scripts/verify-migration.mjs --require-complete  # cutover-day gate
//   node database/scripts/verify-migration.mjs --manifest=/path/to/other.json
//
// Connections (read-only on BOTH - `SET default_transaction_read_only = on`):
//   V1_DATABASE_URL / --source-url=...    the V1 source (v1_staging after Stage 1)
//   V3_DATABASE_URL / --target-url=...    the V3 target
//
// Exit 0 = green (safe to proceed), 1 = mismatch (DO NOT cut over), 2 = usage/manifest error.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { canon, norm } from "../../scripts/migration/normalize.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAPPING_PATH = path.join(HERE, "../../scripts/migration/mapping.json");
const CENSUS_PATH = path.join(HERE, "../../scripts/migration/v1-tables.json");

/** Where Stage 2 records its reason-coded skips (scripts/migration/lib.ts). */
const REPORT_TABLE = "mig.unresolved";

/** Above this many source rows, check 2 compares a deterministic sample. */
const DEFAULT_SAMPLE_ABOVE = 10000;

/** The three dispositions every one of the 199 tables must carry, exactly one. */
const DISPOSITIONS = new Set(["transform", "drop", "blocked"]);

export { canon, norm };

// -- CLI ---------------------------------------------------------------------

export function parseArgs(argv) {
  const flags = {
    table: null,
    json: false,
    selfCheck: false,
    requireComplete: false,
    maxDiffs: 5,
    sampleAbove: DEFAULT_SAMPLE_ABOVE,
    manifest: null,
    sourceUrl: null,
    targetUrl: null,
  };
  for (const arg of argv) {
    if (arg === "--json") flags.json = true;
    else if (arg === "--self-check") flags.selfCheck = true;
    else if (arg === "--require-complete") flags.requireComplete = true;
    else if (arg.startsWith("--table=")) flags.table = arg.slice(8);
    else if (arg.startsWith("--max-diffs=")) flags.maxDiffs = Number(arg.slice(12));
    else if (arg.startsWith("--sample-above=")) flags.sampleAbove = Number(arg.slice(15));
    else if (arg.startsWith("--manifest=")) flags.manifest = arg.slice(11);
    else if (arg.startsWith("--source-url=")) flags.sourceUrl = arg.slice(13);
    else if (arg.startsWith("--target-url=")) flags.targetUrl = arg.slice(13);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(flags.maxDiffs) || flags.maxDiffs < 0) throw new Error("--max-diffs must be a non-negative integer");
  if (!Number.isInteger(flags.sampleAbove) || flags.sampleAbove < 1) throw new Error("--sample-above must be a positive integer");
  return flags;
}

// -- Small helpers -----------------------------------------------------------

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

function froms(column) {
  if (column.from === null || column.from === undefined) return [];
  return Array.isArray(column.from) ? column.from : [column.from];
}

/** The V1 table a mapping consumes, as it is named in the disposition ledger. */
export function sourceTableName(mapping) {
  const { schema, name } = splitQualified(mapping.source.table);
  return schema === "public" || schema === "v1_staging" ? name : `${schema}.${name}`;
}

/**
 * A source outside the 199-table census (today: auth.users, staged as
 * v1_staging.auth_users). Matched on either name so a mapping can point at the
 * staging table without the ledger losing track of what it came from.
 */
export function extraSourceFor(manifest, tableName, qualified) {
  const extras = manifest.extraSources ?? {};
  if (extras[qualified]) return extras[qualified];
  for (const [key, entry] of Object.entries(extras)) {
    if (key.startsWith("$")) continue;
    if (entry.stagingTable === tableName || key === tableName) return entry;
  }
  return null;
}

/**
 * The deterministic sample predicate for check 2.
 *
 * `fraction` of the rows, chosen by the md5 of the identity expression. The same
 * expression runs on BOTH sides, so the two queries pick the SAME rows - which is
 * what makes this a sample rather than a coincidence. A random sample would make
 * the gate flaky; a "first N" sample would only ever look at the oldest data.
 *
 * Returns null when everything should be compared.
 */
export function sampleClause(identityExpr, sourceRows, threshold) {
  if (!Number.isFinite(sourceRows) || sourceRows <= threshold) return null;
  const fraction = threshold / sourceRows;
  // 4 hex digits of md5 = 65,536 buckets; the bound is the fraction of them.
  const bound = Math.max(1, Math.min(0xffff, Math.round(fraction * 0x10000)));
  const hex = bound.toString(16).padStart(4, "0");
  return {
    sql: `substr(md5((${identityExpr})::text), 1, 4) <= ${quoteLiteral(hex)}`,
    fraction,
    bound: hex,
  };
}

// -- Manifest validation: an unlisted source column is an error, never a pass --

/**
 * Structural checks on the manifest itself. Runs with no database, so the
 * fixtures in the test suite can use it too.
 */
export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || !Array.isArray(manifest.mappings) || manifest.mappings.length === 0) {
    return ["manifest has no `mappings` array"];
  }

  // -- the disposition ledger, when this manifest carries one --
  const ledger = manifest.tables ?? null;
  const reasonCodes = new Set(Object.keys(manifest.meta?.reasonCodes ?? {}).filter((k) => !k.startsWith("$")));
  if (ledger) {
    if (reasonCodes.size === 0) errors.push("meta.reasonCodes is missing - the reason enum must be closed, and closed means written down");
    for (const [table, entry] of Object.entries(ledger)) {
      const where = `table ${table}`;
      if (!DISPOSITIONS.has(entry?.disposition)) {
        errors.push(`${where}: disposition must be one of transform | drop | blocked (got ${JSON.stringify(entry?.disposition)}) - an undispositioned table is an error, not a default`);
        continue;
      }
      if (entry.disposition === "transform" && (!Array.isArray(entry.targets) || entry.targets.length === 0)) {
        errors.push(`${where}: a transform must name its V3 target(s)`);
      }
      if (entry.disposition === "drop") {
        if (!entry.reasonCode) errors.push(`${where}: a drop needs a reasonCode from the closed enum`);
        else if (reasonCodes.size && !reasonCodes.has(entry.reasonCode)) {
          errors.push(`${where}: reasonCode "${entry.reasonCode}" is not in meta.reasonCodes`);
        }
        if (!entry.reason || String(entry.reason).trim().length < 20) {
          errors.push(`${where}: a drop needs a real reason, not a label`);
        }
      }
      if (entry.disposition === "blocked" && !entry.dependency) {
        errors.push(`${where}: a blocked table must name the dependency that unblocks it`);
      }
    }
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
        errors.push(`${where}: dropped column ${d.column} needs a real reason - "default to review, never skip"`);
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
        errors.push(`${where}: extraTargetRows policy "allow" needs an integer \`max\` - an uncapped allowance is a silent skip`);
      }
      if (!m.extraTargetRows.reason) errors.push(`${where}: extraTargetRows policy "allow" needs a reason`);
    }

    // Check 5's declaration half: a junction must name both of its parents, and
    // they must be mappings this run can actually reconcile.
    if (m.junction) {
      const parents = m.junction.parents;
      if (!Array.isArray(parents) || parents.length !== 2) {
        errors.push(`${where}: a junction must declare exactly two parent mappings (defect D8)`);
      } else {
        for (const p of parents) {
          if (!manifest.mappings.some((other) => other.name === p)) {
            errors.push(`${where}: junction parent "${p}" is not a mapping in this manifest`);
          }
          if (p === m.name) errors.push(`${where}: a junction cannot be its own parent`);
        }
      }
    }

    // A mapping for a table the ledger did not disposition `transform` is a
    // contradiction: either the ledger is stale or the mapping should not exist.
    if (ledger) {
      const table = sourceTableName(m);
      const entry = ledger[table] ?? extraSourceFor(manifest, table, m.source.table);
      if (!entry) {
        errors.push(`${where}: source table ${table} is not dispositioned in the ledger`);
      } else if (entry.disposition !== "transform") {
        errors.push(`${where}: source table ${table} is dispositioned "${entry.disposition}", so it must not have a verification mapping`);
      }
    }
  }
  return errors;
}

/**
 * The arithmetic base: the ledger must disposition the census exactly - no table
 * missing, no table invented. Separate from validateManifest so the test fixtures,
 * which have no census, still work.
 */
export function validateCensus(manifest, census) {
  const errors = [];
  const declared = new Set(Object.keys(manifest.tables ?? {}));
  for (const t of census.tables) if (!declared.has(t)) errors.push(`census table ${t} is not dispositioned - coverage is arithmetic, not memory`);
  for (const t of declared) if (!census.tables.includes(t)) errors.push(`ledger names ${t}, which is not in the ${census.tables.length}-table census`);
  return errors;
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
      problems.push(`source column ${mapping.source.table}.${col} is neither mapped nor declared dropped - manifest error, not a pass`);
    }
  }
  for (const col of accounted) {
    if (!actual.has(col)) problems.push(`manifest names ${mapping.source.table}.${col}, which does not exist in the source`);
  }
  return problems;
}

// -- Query building ----------------------------------------------------------

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

function buildSelect(side, identityExpr, columns, exprKey, extraFilter) {
  const cols = columns.map((c) => `${c[exprKey]} AS ${quoteIdent(c.name)}`);
  const joins = (side.joins ?? []).join(" ");
  const conditions = [side.filter, extraFilter].filter(Boolean);
  const where = conditions.length ? `WHERE ${conditions.map((c) => `(${c})`).join(" AND ")}` : "";
  return `SELECT ${identityExpr} AS __key, ${cols.join(", ")} FROM ${side.table} ${side.alias} ${joins} ${where}`;
}

function buildCount(side, extraFilter) {
  const joins = (side.joins ?? []).join(" ");
  const conditions = [side.filter, extraFilter].filter(Boolean);
  const where = conditions.length ? `WHERE ${conditions.map((c) => `(${c})`).join(" AND ")}` : "";
  return `SELECT count(*)::int AS n FROM ${side.table} ${side.alias} ${joins} ${where}`;
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

/**
 * The identity keys this mapping's source table already accounted for in the
 * skip report. KEYS, not a count: "three rows were skipped" and "these three
 * rows were skipped" are different claims, and only the second one can prove a
 * missing row was a decision rather than a bug.
 *
 * Returns null when the report table does not exist yet - Stage 2 has not run,
 * which is a different thing from "nothing was skipped".
 */
async function skipReportKeys(target, sourceTable) {
  const { rows: exists } = await target.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [REPORT_TABLE]);
  if (!exists[0].present) return null;
  const { rows } = await target.query(
    `SELECT DISTINCT source_key FROM ${REPORT_TABLE} WHERE source_table = $1`,
    [sourceTable],
  );
  return new Set(rows.map((r) => String(r.source_key)));
}

// -- Checks 1 + 2, per mapping -----------------------------------------------

async function verifyMapping(mapping, clients, ctes, flags) {
  const result = {
    name: mapping.name,
    source: mapping.source.table,
    target: mapping.target.table,
    identity: mapping.identity.label ?? mapping.identity.source,
    junction: mapping.junction?.parents ?? null,
    checks: {},
    errors: [],
  };

  const coverage = await checkColumnCoverage(clients.source, mapping);
  result.checks.coverage = { pass: coverage.length === 0, problems: coverage };
  if (coverage.length) {
    result.errors.push(...coverage);
    return result;
  }

  // Check 1 counts the WHOLE population; check 2 may compare a sample of it, so
  // the two numbers are gathered separately and on purpose.
  const { rows: srcCountRows } = await clients.source.query(`${ctes.source}${buildCount(mapping.source, null)}`);
  const sourceTotal = srcCountRows[0].n;
  const sample = sampleClause(mapping.identity.source, sourceTotal, flags.sampleAbove);

  const sourceSql = buildSelect(mapping.source, mapping.identity.source, mapping.columns, "source", sample?.sql ?? null);
  const targetSampleClause = sample
    ? sample.sql.replace(`(${mapping.identity.source})`, `(${mapping.identity.target})`)
    : null;
  let targetSql = buildSelect(
    { ...mapping.target, joins: mapping.target.joins },
    mapping.identity.target,
    mapping.columns,
    "target",
    targetSampleClause,
  );

  if (mapping.target.schemaExpand) {
    const { rows } = await clients.target.query(mapping.target.schemaExpand);
    const schemas = rows.map((r) => r.schema ?? Object.values(r)[0]);
    targetSql = expandSchemas(targetSql, schemas);
    result.tenantSchemas = schemas.length;
  }

  const src = await fetchSide(clients.source, ctes.source, sourceSql);
  const tgt = await fetchSide(clients.target, ctes.target, targetSql);

  // -- Check 1: count reconciliation --
  const missing = [...src.byKey.keys()].filter((k) => !tgt.byKey.has(k));
  const extra = [...tgt.byKey.keys()].filter((k) => !src.byKey.has(k));
  const policy = mapping.extraTargetRows?.policy ?? "fail";
  const allowance = policy === "allow" ? mapping.extraTargetRows.max : 0;
  const extraAllowed = policy === "allow" && extra.length <= allowance;

  // The arithmetic: source == target + reason-coded skips, key by key. A missing
  // row is acceptable ONLY when the report names that exact key; a report row for
  // some other key does not excuse it. Only meaningful over the whole population,
  // so it is skipped (and said so) when sampling.
  const reportedKeys = await skipReportKeys(clients.target, sourceTableName(mapping));
  const unexplainedMissing = reportedKeys ? missing.filter((k) => !reportedKeys.has(k)) : missing;
  let reconciliation = null;
  if (!sample) {
    const explained = missing.length - unexplainedMissing.length;
    reconciliation = {
      pass: unexplainedMissing.length === 0,
      sourceRows: sourceTotal,
      migrated: src.rows.length - missing.length,
      explainedSkips: explained,
      unaccounted: unexplainedMissing.length,
      unaccountedKeys: unexplainedMissing.slice(0, flags.maxDiffs),
      reportTablePresent: reportedKeys !== null,
    };
  }

  result.checks.count = {
    pass:
      unexplainedMissing.length === 0 &&
      (extra.length === 0 || extraAllowed) &&
      src.duplicates.length === 0 &&
      tgt.duplicates.length === 0,
    sourceRows: src.rows.length,
    sourceTotal,
    targetRows: tgt.rows.length,
    matched: src.rows.length - missing.length,
    missing: missing.slice(0, flags.maxDiffs),
    missingTotal: missing.length,
    unexplainedMissing: unexplainedMissing.slice(0, flags.maxDiffs),
    unexplainedMissingTotal: unexplainedMissing.length,
    extra: extra.slice(0, flags.maxDiffs),
    extraTotal: extra.length,
    extraAllowance: policy === "allow" ? { max: allowance, reason: mapping.extraTargetRows.reason } : null,
    duplicateSourceKeys: src.duplicates.slice(0, flags.maxDiffs),
    duplicateTargetKeys: tgt.duplicates.slice(0, flags.maxDiffs),
    reconciliation,
  };

  // -- Check 2: content spot-parity --
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
      if (diffs.length < flags.maxDiffs) diffs.push({ key, columns: rowDiffs });
    }
  }
  result.checks.content = {
    pass: differingRows === 0,
    comparedRows: src.byKey.size - missing.length,
    comparedColumns: mapping.columns.length,
    differingRows,
    sampled: sample ? { of: sourceTotal, fraction: sample.fraction, bound: sample.bound } : null,
    samples: diffs,
  };

  return result;
}

// -- Check 3: FK orphans in the target ---------------------------------------

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

// -- Check 4: sequence health in the target ----------------------------------

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

// -- Check 5: the junction guard (defect D8) ---------------------------------

/**
 * A junction row is meaningless unless both of its parents are already there.
 * `ON CONFLICT DO NOTHING` would swallow the ones whose parents are not, so a
 * junction is only trusted when BOTH declared parent mappings reconciled in this
 * same run. A junction whose own numbers look perfect is still RED if a parent
 * failed - that is the whole point: the failure mode is invisible locally.
 */
export function checkJunctions(mappingResults) {
  const byName = new Map(mappingResults.map((m) => [m.name, m]));
  const violations = [];
  let guarded = 0;
  for (const m of mappingResults) {
    if (!m.junction) continue;
    guarded += 1;
    for (const parentName of m.junction) {
      const parent = byName.get(parentName);
      if (!parent) {
        violations.push({ junction: m.name, parent: parentName, reason: "parent mapping was not verified in this run" });
        continue;
      }
      const parentOk = Object.values(parent.checks).every((c) => c.pass);
      if (!parentOk) {
        violations.push({ junction: m.name, parent: parentName, reason: "parent mapping did not reconcile" });
      }
    }
  }
  return { pass: violations.length === 0, junctionsGuarded: guarded, violations, violationsTotal: violations.length };
}

// -- Check 6: every report row must be explained -----------------------------

/**
 * mig.unresolved is the ledger of everything Stage 2 could not place. It is only
 * worth having if every row says WHY, in a vocabulary agreed in advance - so an
 * unknown reason code, or a blank one, fails the gate. "Unexplained" is exactly
 * what silent data loss looks like in a report.
 */
export async function checkReportExplained(target, manifest, maxDiffs) {
  const allowed = new Set(Object.keys(manifest.meta?.reasonCodes ?? {}).filter((k) => !k.startsWith("$")));
  const { rows: exists } = await target.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [REPORT_TABLE]);
  if (!exists[0].present) {
    return { pass: true, reportTablePresent: false, rows: 0, byReason: {}, unknown: [], unknownTotal: 0, allowedCodes: allowed.size };
  }
  const { rows } = await target.query(
    `SELECT coalesce(nullif(btrim(reason_code), ''), '(blank)') AS reason_code, count(*)::int AS n
       FROM ${REPORT_TABLE} GROUP BY 1 ORDER BY 2 DESC`,
  );
  const byReason = {};
  const unknown = [];
  let total = 0;
  for (const r of rows) {
    byReason[r.reason_code] = r.n;
    total += r.n;
    if (!allowed.has(r.reason_code)) unknown.push({ reasonCode: r.reason_code, rows: r.n });
  }
  return {
    pass: unknown.length === 0,
    reportTablePresent: true,
    rows: total,
    byReason,
    unknown: unknown.slice(0, maxDiffs),
    unknownTotal: unknown.length,
    allowedCodes: allowed.size,
  };
}

// -- Completeness: transform tables that have no mapping yet -----------------

/**
 * Honest by default: a `transform` table with no mapping means its wave has not
 * run, which is true and fine mid-programme. `--require-complete` turns that into
 * a failure - the cutover-day form of the gate, where "not yet" is not an answer.
 */
export function checkCompleteness(manifest, required) {
  const ledger = manifest.tables ?? {};
  const mapped = new Set(manifest.mappings.map((m) => sourceTableName(m)));
  const pending = Object.entries(ledger)
    .filter(([t, e]) => e.disposition === "transform" && !mapped.has(t))
    .map(([t, e]) => ({ table: t, wave: e.wave ?? null }));
  const counts = { transform: 0, drop: 0, blocked: 0 };
  for (const e of Object.values(ledger)) counts[e.disposition] = (counts[e.disposition] ?? 0) + 1;
  return {
    pass: !required || pending.length === 0,
    required,
    dispositioned: Object.keys(ledger).length,
    counts,
    pendingTotal: pending.length,
    pending: pending.slice(0, 20),
  };
}

// -- Reporting ---------------------------------------------------------------

function printReport(report) {
  const line = (s = "") => console.log(s);
  line(`GATE 2 - V1 -> V3 migration parity`);
  line(`  manifest : ${report.manifest}`);
  line(`  source   : ${report.sourceLabel}`);
  line(`  target   : ${report.targetLabel}`);
  line();

  for (const m of report.mappings) {
    const ok = Object.values(m.checks).every((c) => c.pass);
    line(`${ok ? "PASS" : "FAIL"}  ${m.name}`);
    line(`      ${m.source} -> ${m.target}${m.tenantSchemas ? ` (${m.tenantSchemas} tenant schemas)` : ""}`);
    line(`      identity: ${m.identity}${m.junction ? `  junction of ${m.junction.join(" + ")}` : ""}`);

    if (m.checks.coverage && !m.checks.coverage.pass) {
      for (const p of m.checks.coverage.problems) line(`      [coverage] ${p}`);
      line();
      continue;
    }
    if (m.checks.error) {
      line(`      [error] ${m.checks.error.message}`);
      line();
      continue;
    }

    const c = m.checks.count;
    line(`      [count]   source=${c.sourceRows} target=${c.targetRows} matched=${c.matched}  ${c.pass ? "ok" : "MISMATCH"}`);
    if (c.reconciliation) {
      const r = c.reconciliation;
      line(
        `        reconciliation: ${r.sourceRows} staged = ${r.migrated} migrated + ${r.explainedSkips} explained skip(s)` +
          (r.unaccounted ? `  -> ${r.unaccounted} UNACCOUNTED: ${r.unaccountedKeys.join(", ")}` : "") +
          (r.reportTablePresent ? "" : `  (${REPORT_TABLE} does not exist yet)`),
      );
    }
    if (c.missingTotal) {
      const explained = c.missingTotal - c.unexplainedMissingTotal;
      line(
        `        missing in target (${c.missingTotal}${explained ? `, ${explained} explained by ${REPORT_TABLE}` : ""}): ` +
          `${c.missing.join(", ")}${c.missingTotal > c.missing.length ? ", ..." : ""}`,
      );
    }
    if (c.extraTotal) {
      const verdict = c.extraAllowance && c.extraTotal <= c.extraAllowance.max ? `allowed, max ${c.extraAllowance.max}` : "NOT ALLOWED";
      line(`        extra in target (${c.extraTotal}, ${verdict}): ${c.extra.join(", ")}${c.extraTotal > c.extra.length ? ", ..." : ""}`);
      if (c.extraAllowance) line(`          reason: ${c.extraAllowance.reason}`);
    }
    if (c.duplicateSourceKeys.length) line(`        duplicate SOURCE identity keys: ${c.duplicateSourceKeys.join(", ")}`);
    if (c.duplicateTargetKeys.length) line(`        duplicate TARGET identity keys: ${c.duplicateTargetKeys.join(", ")}`);

    const ct = m.checks.content;
    const sampled = ct.sampled ? ` (deterministic sample of ${ct.sampled.of}, md5 <= ${ct.sampled.bound})` : "";
    line(`      [content] ${ct.comparedRows} rows x ${ct.comparedColumns} mapped columns${sampled}, ${ct.differingRows} differing  ${ct.pass ? "ok" : "MISMATCH"}`);
    for (const d of ct.samples) {
      line(`        row ${d.key}`);
      for (const col of d.columns) {
        line(`          ${col.column}: expected ${JSON.stringify(col.expected)} - actual ${JSON.stringify(col.actual)}`);
      }
    }
    line();
  }

  const fk = report.fk;
  line(`${fk.pass ? "PASS" : "FAIL"}  3 fk-orphans    ${fk.constraintsScanned} constraints scanned, ${fk.violationsTotal} violated`);
  for (const v of fk.violations) {
    line(`      ${v.error ?? `${v.constraint}: ${v.orphans} orphan(s) in ${v.child}(${v.columns.join(",")}) -> ${v.parent}`}`);
  }

  const seq = report.sequences;
  line(`${seq.pass ? "PASS" : "FAIL"}  4 sequences     ${seq.sequencesScanned} scanned, ${seq.behindTotal} behind max(pk)`);
  for (const s of seq.behind) {
    line(`      ${s.table}.${s.column}: sequence at ${s.sequenceAt}, max(pk) ${s.maxPk} - the next insert would collide`);
  }

  const j = report.junctions;
  line(`${j.pass ? "PASS" : "FAIL"}  5 junctions     ${j.junctionsGuarded} guarded, ${j.violationsTotal} loading over an unreconciled parent`);
  for (const v of j.violations) line(`      ${v.junction}: parent ${v.parent} - ${v.reason}`);

  const rep = report.reportExplained;
  line(
    `${rep.pass ? "PASS" : "FAIL"}  6 report        ${rep.reportTablePresent ? `${rep.rows} row(s) in ${REPORT_TABLE}, ${rep.unknownTotal} with an unknown reason` : `${REPORT_TABLE} does not exist yet (Stage 2 has not run)`}`,
  );
  for (const [code, n] of Object.entries(rep.byReason)) line(`      ${code}: ${n}`);
  for (const u of rep.unknown) line(`      UNKNOWN REASON "${u.reasonCode}" on ${u.rows} row(s) - an unexplained skip is a red gate`);

  const comp = report.completeness;
  if (comp) {
    line(
      `${comp.pass ? "PASS" : "FAIL"}  coverage       ${comp.dispositioned} tables dispositioned ` +
        `(${comp.counts.transform} transform, ${comp.counts.drop} drop, ${comp.counts.blocked} blocked); ` +
        `${comp.pendingTotal} transform table(s) not yet verified${comp.required ? " - REQUIRED" : ""}`,
    );
    if (comp.required) for (const p of comp.pending) line(`      no mapping yet: ${p.table} (${p.wave ?? "wave unset"})`);
  }

  line();
  line(
    report.pass
      ? `PARITY GREEN - ${report.mappings.length} mapping(s) match. Safe to proceed.`
      : `PARITY FAILED - ${report.failures} issue(s). DO NOT cut over.`,
  );
}

// -- Self-check: manifest + normalizer, no database required -----------------

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
  // ...but a value difference still is.
  assert.notEqual(canon({ a: 1 }), canon({ a: 2 }));
  assert.equal(canon([1, "x", null]), canon([1, "x", null]));
  assert.notEqual(canon(1), canon("1"));

  // Deterministic sampling: off below the threshold, and the SAME predicate on
  // both sides above it, or it is not a comparison.
  assert.equal(sampleClause("s.id", 100, 10000), null);
  assert.equal(sampleClause("s.id", NaN, 10000), null);
  const s = sampleClause("s.id", 100000, 10000);
  assert.ok(s.sql.includes("md5((s.id)::text)"));
  assert.ok(s.fraction > 0.09 && s.fraction < 0.11);
  assert.equal(sampleClause("s.id", 100000, 10000).sql, sampleClause("s.id", 100000, 10000).sql, "sampling must be deterministic");

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
        junction: { parents: ["nope"] },
      },
    ],
  };
  const badErrors = validateManifest(bad);
  assert.ok(badErrors.some((e) => e.includes("both mapped")), "must reject a column that is mapped and dropped");
  assert.ok(badErrors.some((e) => e.includes("needs an integer")), "must reject an uncapped extra-row allowance");
  assert.ok(badErrors.some((e) => e.includes("exactly two parent")), "must reject a junction that does not declare both parents");

  // An undispositioned table is an error, not a default.
  const noDisposition = validateManifest({
    meta: { reasonCodes: { ci_junk: "x" } },
    tables: { foo: { wave: "W1" } },
    mappings: manifest.mappings,
  });
  assert.ok(noDisposition.some((e) => e.includes("not a default")), "must reject a table with no disposition");
  const badDrop = validateManifest({
    meta: { reasonCodes: { ci_junk: "x" } },
    tables: { foo: { disposition: "drop", reason: "a reason long enough to be real" } },
    mappings: manifest.mappings,
  });
  assert.ok(badDrop.some((e) => e.includes("reasonCode")), "must reject a drop with no reason code");

  // Check 5 in isolation: a junction is red when a parent is red, however good
  // its own numbers look.
  const clean = { name: "p", checks: { count: { pass: true } } };
  const brokenParent = { name: "p", checks: { count: { pass: false } } };
  const junc = { name: "j", junction: ["p", "p2"], checks: { count: { pass: true } } };
  const p2 = { name: "p2", checks: { count: { pass: true } } };
  assert.equal(checkJunctions([clean, p2, junc]).pass, true);
  assert.equal(checkJunctions([brokenParent, p2, junc]).pass, false, "a junction over an unreconciled parent must be red");
  assert.equal(checkJunctions([clean, junc]).violations[0].parent, "p2", "a parent that was not verified at all must be named");

  // The census cross-check runs only on the real ledger.
  if (manifest.tables) {
    const census = JSON.parse(readFileSync(CENSUS_PATH, "utf8"));
    const censusErrors = validateCensus(manifest, census);
    assert.deepEqual(censusErrors, [], `census errors:\n  ${censusErrors.join("\n  ")}`);
    const comp = checkCompleteness(manifest, false);
    console.log(
      `self-check: ok - ${comp.dispositioned}/${census.tables.length} tables dispositioned ` +
        `(${comp.counts.transform} transform, ${comp.counts.drop} drop, ${comp.counts.blocked} blocked), ` +
        `${manifest.mappings.length} verification mapping(s), ${comp.pendingTotal} transform table(s) awaiting one`,
    );
  } else {
    console.log(`self-check: ok - ${manifest.mappings.length} mapping(s) in ${manifestPath} are well-formed`);
  }
  for (const m of manifest.mappings) {
    console.log(`  ${m.name}: ${m.columns.length} compared, ${m.dropped.length} declared dropped`);
  }
}

// -- Main --------------------------------------------------------------------

async function connect(url, label) {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`${label}: cannot connect - ${err.message}`, { cause: err });
  }
  // Read-only at the transaction level: this script physically cannot write.
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

  const manifestPath = flags.manifest ? path.resolve(flags.manifest) : MAPPING_PATH;
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
  if (manifest.tables) manifestErrors.push(...validateCensus(manifest, JSON.parse(readFileSync(CENSUS_PATH, "utf8"))));
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
    junctions: null,
    reportExplained: null,
    completeness: null,
    pass: false,
    failures: 0,
  };

  try {
    const ctes = await buildLookupCte(manifest, clients);
    for (const m of mappings) {
      try {
        report.mappings.push(await verifyMapping(m, clients, ctes, flags));
      } catch (err) {
        report.mappings.push({
          name: m.name,
          source: m.source.table,
          target: m.target.table,
          identity: m.identity?.label ?? "",
          junction: m.junction?.parents ?? null,
          checks: { error: { pass: false, message: String(err.message || err).split("\n")[0] } },
          errors: [String(err.message || err)],
        });
      }
    }
    const schemas = manifest.structural?.schemas ?? [];
    report.fk = await scanForeignKeys(clients.target, schemas, flags.maxDiffs);
    report.sequences = await scanSequences(clients.target, schemas, flags.maxDiffs);
    report.junctions = checkJunctions(report.mappings);
    report.reportExplained = await checkReportExplained(clients.target, manifest, flags.maxDiffs);
    if (manifest.tables) report.completeness = checkCompleteness(manifest, flags.requireComplete);
  } finally {
    await clients.source.end().catch(() => {});
    await clients.target.end().catch(() => {});
  }

  report.failures =
    report.mappings.reduce((n, m) => n + Object.values(m.checks).filter((c) => !c.pass).length, 0) +
    (report.fk.pass ? 0 : 1) +
    (report.sequences.pass ? 0 : 1) +
    (report.junctions.pass ? 0 : 1) +
    (report.reportExplained.pass ? 0 : 1) +
    (report.completeness && !report.completeness.pass ? 1 : 0);
  report.pass = report.failures === 0;

  if (flags.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);

  return report.pass ? 0 : 1;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
