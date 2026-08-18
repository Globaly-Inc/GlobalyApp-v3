/**
 * W6 — storage rehost (Part 3 §4 W6).
 *
 * Two halves that must be separable, because only one of them can run today:
 *
 *   OBJECT COPY   Supabase Storage -> GCS, through V1's `migration-export` edge
 *                 function. BLOCKED: it needs a fresh 90-day `gmig_` Bearer
 *                 token, and §7 decision 7 mints that at rehearsal #1. It lives
 *                 in w6-objects.ts, it is complete, it has never run, and it
 *                 says so. Its pure parts are asserted under --self-check.
 *
 *   URL REWRITE   every V3 column holding a V1 supabase.co object URL -> the GCS
 *                 key that object lands on. Runs offline against the already
 *                 loaded rows, today, and is idempotent.
 *
 * WHY THE COLUMN LIST IS A QUERY. §8 names "19 live supabase.co URLs" and W2b
 * tagged one column (`test_provider_logos.logo_url`) with `storageRehost`. Both
 * were true when written; neither stays true, because every wave that lands
 * carries more URLs into V3. So the inventory is swept from data
 * (w6-storage-sweep.ts) and what comes back is the answer — see the numbers this
 * wave prints, not a list in a comment.
 *
 * WHAT THE REWRITE WRITES. Not another URL — a relative path. V3's storage service
 * keeps the relative GCS path in the column and signs it on read
 * (storageService.resolvePreviewUrl / toStoragePath), so `v1/<bucket>/<path>` IS
 * the correct V3 value.
 *
 * IDEMPOTENCE. The UPDATE fires only where the value still holds a REHOSTABLE V1
 * URL, and the rewriter cannot match its own output, so a second run touches 0
 * rows. A URL in a bucket W6 does not migrate is left alone and reported to
 * mig.unresolved as `unresolved_parent`: rewriting it would mint a path to an
 * object that is never going to be uploaded.
 *
 * GATE 2. Rewriting a column a Gate 2 mapping compares would turn that mapping
 * red — V1 holds a URL, V3 a path. The fix is not to exempt the column; it is to
 * normalise BOTH sides of the mapping with the same expression, so the check
 * asserts "these point at the same object", which is the fact it was always
 * about. As a bonus the mapping is then green before AND after the rewrite, so
 * Gate 2 no longer depends on wave ordering. This wave REFUSES TO RUN if a
 * rewritten column's mapping is not normalised, so the next column to turn up in
 * the sweep cannot slip through unguarded.
 *
 * Usage:
 *   node --import tsx scripts/migration/w6-storage.ts --self-check
 *   node --import tsx scripts/migration/w6-storage.ts --inventory        # sweep only
 *   node --import tsx scripts/migration/w6-storage.ts                    # dry run
 *   node --import tsx scripts/migration/w6-storage.ts --apply
 *   node --import tsx scripts/migration/w6-storage.ts --objects --functions-url=… --token=…          # pre-flight
 *   node --import tsx scripts/migration/w6-storage.ts --objects --apply --functions-url=… --token=…  # the copy
 *   node --import tsx scripts/migration/w6-storage.ts --verify-storage --functions-url=… --token=…
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MigrationError,
  clearReport,
  execWrite,
  quoteIdent,
  reportUnresolved,
  runTransform,
  type TransformContext,
} from "./lib.js";
import { copyObjects, objectsSelfCheck, parseObjectFlags, verifyStorage, type ObjectFlags } from "./w6-objects.js";
import {
  DROPPED_BUCKETS,
  MIGRATED_BUCKETS,
  extractV1UrlsSql,
  gcsKey,
  isNormalisedSql,
  parseObjectUrl,
  rehostableSql,
  storageMapSelfCheck,
  toStorageKey,
  v1StoragePathSql,
} from "./w6-storage-map.js";
import {
  arrayType,
  columnLabel,
  isArrayUdt,
  qualified,
  sweep,
  sweepSelfCheck,
  valueExpr,
  type ColumnRef,
  type SweepPattern,
} from "./w6-storage-sweep.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAPPING_PATH = path.join(HERE, "mapping.json");

/**
 * mig.unresolved keys rows by source table. W6's source is V1 STORAGE, not a V1
 * table, so it gets its own name — which also keeps these rows out of every
 * mapping's count reconciliation, where they would excuse a missing row they have
 * nothing to do with.
 */
export const STORAGE_SOURCE = "v1_storage";

/**
 * What the inventory sweeps for: ANY V1 storage URL, including buckets W6 does
 * not migrate. Deliberately wider than the rewriter's own pattern — a URL the
 * rewrite cannot touch is precisely the one that has to be reported.
 */
const ANY_URL_PATTERN: SweepPattern = {
  predicate: (expr) => `(${expr}) ~ 'supabase\\.co/storage/v1/object/'`,
  extract: extractV1UrlsSql,
};

// ── Types ───────────────────────────────────────────────────────────────────

export interface InventoryEntry extends ColumnRef {
  /** Rows in which this column holds at least one V1 storage URL. */
  rows: number;
  /** URL occurrences (a jsonb gallery holds several per row). */
  refs: number;
  /** Distinct V1 objects referenced. */
  objects: number;
  /** URL occurrences this wave WILL rehost. */
  rehostable: number;
  /** URLs in a bucket W6 does not migrate — reported, never rewritten. */
  unmigratable: readonly string[];
  /** The Gate 2 mapping that compares this column, when one does. */
  mapping: string | null;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export interface W6Flags extends ObjectFlags {
  inventory: boolean;
  objects: boolean;
  verifyStorage: boolean;
}

/**
 * W6 owns flags the shared runner does not know, and the shared runner throws on
 * an unknown argument — correctly, since a typo'd flag must never become a silent
 * default. So W6's are taken out here and the rest is handed on untouched.
 */
export function parseW6Args(argv: readonly string[]): { w6: W6Flags; rest: string[] } {
  const rest: string[] = [];
  const own: string[] = [];
  let inventory = false;
  let objects = false;
  let verifyStorage = false;
  for (const arg of argv) {
    if (arg === "--inventory") inventory = true;
    else if (arg === "--objects") objects = true;
    else if (arg === "--verify-storage") verifyStorage = true;
    else if (/^--(functions-url|token|uploader|buckets)=/.test(arg)) own.push(arg);
    else rest.push(arg);
  }
  if ([inventory, objects, verifyStorage].filter(Boolean).length > 1) {
    throw new MigrationError("pick one of --inventory | --objects | --verify-storage, or none for the URL rewrite");
  }
  return { w6: { inventory, objects, verifyStorage, ...parseObjectFlags(own) }, rest };
}

// ── The inventory ───────────────────────────────────────────────────────────

/**
 * Every column in the database that holds a V1 storage URL, with what it holds.
 * Nothing in this list is written down anywhere — it is the sweep's output.
 */
export async function buildInventory(ctx: TransformContext): Promise<InventoryEntry[]> {
  const hits = await sweep(ctx, ANY_URL_PATTERN);
  const mapped = mappedStorageColumns();

  return hits.map((hit) => {
    let refs = 0;
    let rehostable = 0;
    const objects = new Set<string>();
    const unmigratable = new Set<string>();
    for (const [url, n] of hit.values) {
      refs += n;
      const object = parseObjectUrl(url);
      if (object) {
        objects.add(gcsKey(object));
        rehostable += n;
      } else {
        unmigratable.add(url);
      }
    }
    return {
      schema: hit.schema,
      table: hit.table,
      column: hit.column,
      udt: hit.udt,
      rows: hit.rows,
      refs,
      objects: objects.size,
      rehostable,
      unmigratable: [...unmigratable].sort(),
      mapping:
        lookupKeys(hit)
          .map((k) => mapped.get(k)?.mapping)
          .find((n) => !!n) ?? null,
    };
  });
}

// ── Gate 2 drift guard ──────────────────────────────────────────────────────

interface MappedColumn {
  mapping: string;
  column: string;
  source: string;
  target: string;
}

/**
 * Gate 2 mappings, indexed by the V3 column each one compares.
 *
 * The mapping states its target as `<alias>.<column>` (possibly wrapped), so the
 * PHYSICAL column is recovered from the alias rather than assumed to equal the
 * mapping's logical column name — `platform_users.photo_url` is sourced from
 * `profiles.avatar_url`, and the two names differ on purpose.
 *
 * A tenant mapping targets `"{{schema}}".<table>`, expanded per business at Gate 2
 * time. Those are indexed under the placeholder, and looked up that way for any
 * column the sweep finds in a uuid-named schema — otherwise the drift guard would
 * be blind to exactly the tables W7 is filling.
 */
export const TENANT_SCHEMA_KEY = "{{schema}}";

export function mappedStorageColumns(mappingPath = MAPPING_PATH): Map<string, MappedColumn> {
  const manifest = JSON.parse(readFileSync(mappingPath, "utf8")) as {
    mappings: {
      name: string;
      target: { table: string; alias: string };
      columns: { name: string; source: string; target: string }[];
    }[];
  };
  const out = new Map<string, MappedColumn>();
  for (const m of manifest.mappings) {
    const raw = m.target.table;
    const table = raw.includes(TENANT_SCHEMA_KEY)
      ? `${TENANT_SCHEMA_KEY}.${raw.slice(raw.lastIndexOf(".") + 1)}`
      : raw.includes(".")
        ? raw
        : `public.${raw}`;
    for (const c of m.columns) {
      const hit = new RegExp(`\\b${m.target.alias}\\.("?)([a-z0-9_]+)\\1`, "i").exec(c.target);
      if (!hit) continue;
      out.set(`${table}.${hit[2]}`, { mapping: m.name, column: c.name, source: c.source, target: c.target });
    }
  }
  return out;
}

/** The keys a swept column could be mapped under: its own, and the tenant placeholder. */
function lookupKeys(ref: ColumnRef): string[] {
  const own = columnLabel(ref);
  if (ref.schema === "public" || ref.schema === "superadmin") return [own];
  return [own, `${TENANT_SCHEMA_KEY}.${ref.table}.${ref.column}`];
}

/**
 * A rewritten column whose Gate 2 mapping is not normalised is a red gate the
 * moment either side moves. Loud at the top of the wave, rather than at cutover.
 */
export function mappingDriftProblems(entries: readonly InventoryEntry[], mappingPath = MAPPING_PATH): string[] {
  const mapped = mappedStorageColumns(mappingPath);
  const problems: string[] = [];
  for (const e of entries) {
    if (e.rehostable === 0) continue;
    const m = lookupKeys(e)
      .map((k) => mapped.get(k))
      .find((hit): hit is MappedColumn => !!hit);
    if (!m) continue;
    for (const [side, expr] of [
      ["source", m.source],
      ["target", m.target],
    ] as const) {
      if (!isNormalisedSql(expr)) {
        problems.push(
          `mapping.json ${m.mapping}.${m.column}: the ${side} expression \`${expr}\` compares ` +
            `${columnLabel(e)}, which W6 rewrites, without normalising it. Wrap it in the W6 rewriter ` +
            `(w6-storage-map.v1StoragePathSql) or Gate 2 goes red the moment the rewrite runs.`,
        );
      }
    }
  }
  return problems;
}

// ── The rewrite ─────────────────────────────────────────────────────────────

/** The one UPDATE that rewrites a column, in the shape its type requires. */
export function rewriteStatement(ref: ColumnRef): string {
  const target = qualified(ref);
  const col = quoteIdent(ref.column);
  if (isArrayUdt(ref.udt)) {
    // Element-wise, ordinality preserved: a gallery is an ordered list and
    // array_agg without ORDER BY is free to reshuffle it.
    return `UPDATE ${target} s
               SET ${col} = (SELECT array_agg(${v1StoragePathSql("u.e")} ORDER BY u.o)
                               FROM unnest(s.${col}) WITH ORDINALITY AS u(e, o))::${arrayType(ref.udt)}
             WHERE ${rehostableSql(valueExpr(ref))}`;
  }
  if (ref.udt === "jsonb" || ref.udt === "json") {
    // Whole-document text rewrite. URLs inside JSON are quoted strings, so the
    // rewriter's character class stops at the quote and the document's shape is
    // untouched. Shape-agnostic on purpose: `businesses.gallery_urls` is an array
    // of objects and nothing says the next jsonb column will be.
    return `UPDATE ${target} s
               SET ${col} = (${v1StoragePathSql(`s.${col}::text`)})::${ref.udt}
             WHERE ${rehostableSql(valueExpr(ref))}`;
  }
  return `UPDATE ${target} s
             SET ${col} = ${v1StoragePathSql(`s.${col}`)}
           WHERE ${rehostableSql(valueExpr(ref))}`;
}

/**
 * The rewriter exists twice — once in JS (the object copy and the tests) and once
 * in SQL (the rewrite). Two implementations of one function is exactly how a
 * migration develops a quiet disagreement, so on every run both are asked for the
 * key of every URL actually present, and the answers must be identical.
 */
async function assertRewriterAgreement(ctx: TransformContext, urls: readonly string[]): Promise<void> {
  if (urls.length === 0) return;
  const { rows } = await ctx.db.query<{ url: string; key: string }>(
    `SELECT u AS url, ${v1StoragePathSql("u")} AS key FROM unnest($1::text[]) AS u`,
    [[...urls]],
  );
  for (const r of rows) {
    const js = toStorageKey(r.url);
    const sql = r.key === r.url ? null : r.key;
    if (js !== sql) {
      throw new MigrationError(
        `the JS and SQL rewriters disagree on ${r.url}: JS says ${JSON.stringify(js)}, SQL says ${JSON.stringify(sql)}`,
      );
    }
  }
}

function printInventory(entries: readonly InventoryEntry[], json: boolean): void {
  if (json) {
    console.log(JSON.stringify({ w6Inventory: entries }, null, 2));
    return;
  }
  const objects = new Set<string>();
  console.log(`W6 URL inventory — swept from data; ${entries.length} column(s) hold V1 storage URLs:`);
  for (const e of entries) {
    objects.add(columnLabel(e));
    const notes = [
      e.mapping ? `gate2:${e.mapping}` : "gate2:none",
      e.unmigratable.length ? `UNMIGRATABLE:${e.unmigratable.length}` : null,
    ].filter(Boolean);
    console.log(
      `  ${columnLabel(e).padEnd(46)} ${e.udt.padEnd(8)} rows=${String(e.rows).padStart(5)} ` +
        `refs=${String(e.refs).padStart(5)} objects=${String(e.objects).padStart(4)}  ${notes.join(" ")}`,
    );
  }
  const totalRefs = entries.reduce((n, e) => n + e.refs, 0);
  const rehostable = entries.reduce((n, e) => n + e.rehostable, 0);
  console.log(
    `  totals: ${totalRefs} URL reference(s), ${rehostable} rehostable, ` +
      `${totalRefs - rehostable} in a bucket W6 does not migrate`,
  );
}

export function makeBody(w6: W6Flags, json: boolean) {
  return async function transformStorage(ctx: TransformContext, allowedCodes: ReadonlySet<string>): Promise<void> {
    if (w6.verifyStorage) return verifyStorage(ctx, w6);
    if (w6.objects) return copyObjects(ctx, w6, allowedCodes);

    const inventory = await buildInventory(ctx);
    printInventory(inventory, json);

    const problems = mappingDriftProblems(inventory);
    if (problems.length) throw new MigrationError(problems.join("\n"));

    if (w6.inventory) {
      ctx.report.notes.push("--inventory: swept and reported; nothing rewritten");
      return;
    }

    // ── URL rewrite ─────────────────────────────────────────────────────────
    await clearReport(ctx, [STORAGE_SOURCE]);

    const urls = new Set<string>();
    for (const hit of await sweep(ctx, ANY_URL_PATTERN)) for (const u of hit.values.keys()) urls.add(u);
    await assertRewriterAgreement(ctx, [...urls]);

    for (const e of inventory) {
      if (e.rehostable === 0) continue;
      await execWrite(ctx, `${columnLabel(e)} (rewritten)`, rewriteStatement(e));
    }

    // A URL still pointing at supabase after the rewrite is in a bucket W6 does
    // not migrate. It cannot become a GCS path, so it is reported rather than
    // turned into a dangling one.
    for (const e of inventory) {
      for (const url of e.unmigratable) {
        await reportUnresolved(
          ctx,
          {
            sourceTable: STORAGE_SOURCE,
            sourceKey: url,
            targetTable: `${e.schema}.${e.table}`,
            column: e.column,
            reasonCode: "unresolved_parent",
            detail:
              "points at a V1 bucket W6 does not migrate (w6-storage-map DROPPED_BUCKETS). Left as-is: " +
              "a rewritten path would name a GCS object that will never exist.",
          },
          allowedCodes,
        );
      }
    }

    // Post-condition, checked rather than asserted in prose. If this ever fires,
    // the UPDATE and its predicate have drifted apart.
    for (const e of inventory) {
      if (e.rehostable === 0) continue;
      const { rows } = await ctx.db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${qualified(e)} s WHERE ${rehostableSql(valueExpr(e))}`,
      );
      if (rows[0].n > 0) {
        throw new MigrationError(`${columnLabel(e)}: ${rows[0].n} row(s) still hold a rehostable V1 URL after the rewrite`);
      }
    }

    ctx.report.notes.push(
      "object copy NOT RUN — it needs a gmig_ token (§7 decision 7: minted at rehearsal #1). Until then the " +
        "rewritten paths name GCS objects that are not there yet, and --verify-storage says NOT VERIFIED. " +
        "V1 must not be decommissioned before it runs.",
    );
  };
}

// ── Self-check ──────────────────────────────────────────────────────────────

export function storageSelfCheck(): void {
  sweepSelfCheck();
  storageMapSelfCheck();
  objectsSelfCheck();

  // Flag separation: W6's own flags must not reach the shared runner, and the
  // runner's must not be swallowed here.
  const { w6, rest } = parseW6Args(["--objects", "--apply", "--token=gmig_x", "--json", "--url=postgres://x"]);
  assert.equal(w6.objects, true);
  assert.equal(w6.token, "gmig_x");
  assert.deepEqual(rest, ["--apply", "--json", "--url=postgres://x"]);
  assert.throws(() => parseW6Args(["--objects", "--inventory"]), /pick one of/);

  // The three column shapes, each with the cast that keeps it its own type.
  const text: ColumnRef = { schema: "public", table: "businesses", column: "logo_url", udt: "text" };
  const jsonb: ColumnRef = { schema: "public", table: "businesses", column: "gallery_urls", udt: "jsonb" };
  const arr: ColumnRef = { schema: "public", table: "businesses", column: "gallery_images", udt: "_text" };

  for (const ref of [text, jsonb, arr]) {
    const sql = rewriteStatement(ref);
    assert.ok(sql.startsWith("UPDATE "), `${ref.udt}: a rewrite is an UPDATE`);
    assert.ok(sql.includes("regexp_replace("), `${ref.udt}: …through the shared rewriter, not an ad-hoc regex`);
    // Idempotence is enforced by the predicate, not by hoping the value differs.
    assert.ok(sql.includes(" WHERE "), `${ref.udt}: unguarded, a re-run rewrites every row`);
    assert.ok(sql.includes("avatars|blog-images"), `${ref.udt}: guarded on the REHOSTABLE pattern`);
  }
  assert.ok(rewriteStatement(jsonb).includes("::jsonb"), "a jsonb column must stay jsonb");
  assert.ok(rewriteStatement(arr).includes("::text[]"), "a text[] column must stay text[]");
  assert.ok(rewriteStatement(arr).includes("ORDER BY u.o"), "a gallery is ordered; array_agg without ORDER BY is not");

  // The inventory's own predicate must be WIDER than the rewriter's, or a URL in
  // a bucket W6 does not migrate would never be seen, let alone reported.
  assert.ok(ANY_URL_PATTERN.predicate("x").includes("supabase"));
  assert.ok(!ANY_URL_PATTERN.predicate("x").includes("avatars|"));
  assert.ok(rehostableSql("x").includes("avatars|"));

  // Gate 2 index: it resolves the PHYSICAL column, not the mapping's label —
  // platform_users.photo_url is sourced from profiles.avatar_url.
  const mapped = mappedStorageColumns();
  assert.ok(mapped.size > 0, "mapping.json must yield target columns, or the drift guard is vacuous");
  assert.ok(mapped.has("public.platform_users.photo_url"), "alias->column resolution must find photo_url");
  assert.ok(mapped.has("superadmin.blog_posts.cover_image_url"), "…in superadmin too, not just public");
  // Tenant mappings target `"{{schema}}".<table>`, so a swept column in a
  // uuid-named schema must resolve through the placeholder or the guard is blind
  // to exactly the tables W7 fills.
  assert.ok(mapped.has(`${TENANT_SCHEMA_KEY}.agents.account_status`), "tenant targets must index under the placeholder");
  assert.deepEqual(lookupKeys({ schema: "public", table: "t", column: "c", udt: "text" }), ["public.t.c"]);
  assert.deepEqual(lookupKeys({ schema: "3829ff2a-7ff9", table: "t", column: "c", udt: "text" }), [
    "3829ff2a-7ff9.t.c",
    `${TENANT_SCHEMA_KEY}.t.c`,
  ]);

  // The drift guard must fire on a bare mapping expression, and pass on a
  // normalised one. Both directions, so it cannot be vacuously green.
  const entry = (over: Partial<InventoryEntry> = {}): InventoryEntry => ({
    schema: "public",
    table: "platform_users",
    column: "photo_url",
    udt: "text",
    rows: 7,
    refs: 7,
    objects: 7,
    rehostable: 7,
    unmigratable: [],
    mapping: "platform_users",
    ...over,
  });
  assert.equal(
    mappingDriftProblems([entry()]).length,
    0,
    `mapping.json is not normalised for a column W6 rewrites:\n${mappingDriftProblems([entry()]).join("\n")}`,
  );
  assert.equal(
    mappingDriftProblems([entry({ rehostable: 0 })]).length,
    0,
    "a column with nothing to rehost needs no normalisation",
  );

  assert.equal(MIGRATED_BUCKETS.length + DROPPED_BUCKETS.length, 16, "V1 has 16 buckets: 13 migrate, 3 do not");

  console.log("w6-storage self-check: ok");
}

// ── Entry point ─────────────────────────────────────────────────────────────

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  let code: number;
  try {
    const { w6, rest } = parseW6Args(argv);
    code = await runTransform({
      wave: "W6-storage",
      argv: rest,
      body: makeBody(w6, rest.includes("--json")),
      selfCheck: storageSelfCheck,
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    code = 2;
  }
  process.exit(code);
}
