/**
 * W3 — student sub-profiles (Part 3 §4 W3, §15 decision 2).
 *
 *   student_qualifications    -> public.platform_user_qualifications
 *   student_work_experiences  -> public.platform_user_work_experiences
 *   student_language_tests    -> public.platform_user_language_tests (category='language')
 *   student_academic_tests    -> public.platform_user_language_tests (category='academic')
 *
 * §15 decision 2: SAT/GRE/GMAT do NOT get their own table. They land in the same
 * language-tests table carrying category='academic', which is what the shipped
 * migration 20260816_002_language_test_category.ts added the discriminator for.
 * Two source tables, one target, one column telling them apart.
 *
 * COLUMN PARITY IS DISCOVERED, NOT DECLARED (convention 2). These four tables
 * were designed in V1 and rebuilt in V3 with almost the same shape, so the
 * columns to write are the intersection of the two live schemas minus the ones
 * V3 owns (the timestamps) and the one that is resolved (user_id). Anything on
 * the source with no home on the target is REPORTED rather than assumed
 * harmless — that rule is what caught 24 silently-unwritten columns before.
 *
 * The V1 uuid PK is preserved as the V3 uuid PK, which makes `id` the natural
 * key: these rows have no other one (a person can hold two IELTS results).
 *
 * THE DATE TRAP. `test_date` is a real `date`, and node-pg hands it back as a JS
 * Date. Stringify one carelessly and every row lands NULL. The loads here are
 * set-based, so no date ever crosses into JavaScript on the write path — and the
 * read-back check below compares both sides through dateOnly(), which is
 * asserted against a JS Date, an ISO string and a naive String() in --self-check.
 *
 * Usage:
 *   node --import tsx scripts/migration/w3-subprofiles.ts --self-check
 *   node --import tsx scripts/migration/w3-subprofiles.ts             # dry run
 *   node --import tsx scripts/migration/w3-subprofiles.ts --apply
 */

import assert from "node:assert/strict";

import {
  clearReport,
  execWrite,
  intersectColumns,
  MigrationError,
  quoteIdent,
  reportUnresolvedQuery,
  runTransform,
  tableColumns,
  unmappedColumns,
  type TransformContext,
} from "./lib.js";

/**
 * Whatever a driver hands back for a `date`, as YYYY-MM-DD.
 *
 * node-pg parses `date` into a JS Date at LOCAL midnight. `String(d)` gives
 * "Wed Aug 12 2020 00:00:00 GMT+1000 (…)", which Postgres will not accept and
 * which a naive `?? null` turns into a NULL column — the exact failure this
 * wave inherited. toISOString() would be wrong too: it shifts the local
 * midnight back across the date boundary for any timezone east of UTC.
 */
export function dateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/** V3 owns these; V1's copies are never carried. `user_id` is resolved instead. */
const NEVER = new Set(["user_id", "created_at", "updated_at", "deleted_at"]);

interface SubProfile {
  source: string;
  target: string;
  /** Extra literal columns the target needs that the source has no column for. */
  extra?: Record<string, string>;
  /** Source columns deliberately not carried, with the reason. */
  ignore?: Record<string, string>;
}

const TABLES: readonly SubProfile[] = [
  { source: "student_qualifications", target: "platform_user_qualifications" },
  {
    source: "student_work_experiences",
    target: "platform_user_work_experiences",
    ignore: {
      source_business_member_id: "V1 linked a work entry back to the business_members row it was derived from. V3 has no such column and no such concept — the agent relationship lives in user_business_index and the tenant agents table.",
    },
  },
  { source: "student_language_tests", target: "platform_user_language_tests", extra: { category: "'language'" } },
  { source: "student_academic_tests", target: "platform_user_language_tests", extra: { category: "'academic'" } },
];

/** The live users a sub-profile row may hang off. */
const LIVE_USER_JOIN = `
    JOIN v1_staging.auth_users u ON u.id = s.user_id
    JOIN public.platform_users pu ON pu.uuid = u.id
   WHERE u.deleted_at IS NULL AND u.email IS NOT NULL AND btrim(u.email::text) <> ''`;

export async function transformSubProfiles(ctx: TransformContext, allowedCodes: ReadonlySet<string>): Promise<void> {
  await clearReport(ctx, TABLES.map((t) => t.source));

  for (const spec of TABLES) {
    const sourceCols = await tableColumns(ctx.db, "v1_staging", spec.source);
    const targetCols = await tableColumns(ctx.db, "public", spec.target);
    const ignore = new Set([...NEVER, ...Object.keys(spec.ignore ?? {})]);
    const shared = intersectColumns(sourceCols, targetCols, ignore);
    const orphaned = unmappedColumns(sourceCols, targetCols, ignore);

    if (!shared.includes("id")) {
      throw new MigrationError(`${spec.source}: the V1 uuid PK must be preserved — it is the only natural key these rows have`);
    }
    if (orphaned.length) {
      // Convention 2: a source column with no home is a manifest error, not a
      // pass. Nothing declared it, so the wave refuses rather than quietly
      // losing it.
      throw new MigrationError(
        `${spec.source}: ${orphaned.join(", ")} exist on the source but not on public.${spec.target} — ` +
          `declare each one in the transform's \`ignore\` with a reason, and in mapping.json's \`dropped\`.`,
      );
    }

    // A sub-profile whose owner did not migrate has nowhere to hang: user_id is
    // NOT NULL, and attaching it to anyone else would be worse than losing it.
    await reportUnresolvedQuery(ctx, allowedCodes, {
      sourceTable: spec.source,
      targetTable: `public.${spec.target}`,
      column: "user_id",
      reasonCode: "unresolved_user",
      sql: `SELECT s.id::text, 'owner ' || s.user_id::text || ' has no platform_users row'
              FROM ${quoteIdent("v1_staging")}.${quoteIdent(spec.source)} s
             WHERE NOT EXISTS (SELECT 1 FROM v1_staging.auth_users u
                                 JOIN public.platform_users pu ON pu.uuid = u.id
                                WHERE u.id = s.user_id AND u.deleted_at IS NULL)`,
    });

    const extraNames = Object.keys(spec.extra ?? {});
    const columns = ["user_id", ...shared, ...extraNames];
    const values = ["pu.id", ...shared.map((c) => `s.${quoteIdent(c)}`), ...extraNames.map((c) => spec.extra![c])];
    const updates = columns.filter((c) => c !== "id");

    await execWrite(
      ctx,
      `public.${spec.target} (${spec.source})`,
      `INSERT INTO public.${quoteIdent(spec.target)} (${columns.map(quoteIdent).join(", ")})
       SELECT ${values.join(", ")}
         FROM ${quoteIdent("v1_staging")}.${quoteIdent(spec.source)} s
       ${LIVE_USER_JOIN}
       ON CONFLICT (id) DO UPDATE SET
         ${updates.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(",\n         ")},
         updated_at = now()`,
    );

    ctx.report.notes.push(`${spec.source} -> ${spec.target}: ${shared.length} columns discovered by introspection${extraNames.length ? ` + ${extraNames.join(", ")}` : ""}`);

    // The date trap, closed with evidence rather than confidence: read both
    // sides of every date column back and compare them through dateOnly().
    for (const column of shared.filter((c) => c.endsWith("_date"))) {
      const { rows } = await ctx.db.query<{ id: string; src: unknown; tgt: unknown }>(
        `SELECT s.id::text AS id, s.${quoteIdent(column)} AS src, t.${quoteIdent(column)} AS tgt
           FROM ${quoteIdent("v1_staging")}.${quoteIdent(spec.source)} s
           JOIN public.${quoteIdent(spec.target)} t ON t.id = s.id`,
      );
      const wrong = rows.filter((r) => dateOnly(r.src) !== dateOnly(r.tgt));
      if (wrong.length) {
        throw new MigrationError(
          `${spec.source}.${column}: ${wrong.length}/${rows.length} rows landed on a different date than the source ` +
            `(first: ${wrong[0].id} ${dateOnly(wrong[0].src)} -> ${dateOnly(wrong[0].tgt)})`,
        );
      }
      const populated = rows.filter((r) => dateOnly(r.tgt) !== null).length;
      ctx.report.notes.push(`${spec.source}.${column}: ${populated}/${rows.length} rows carry a date, all matching the source`);
    }
  }
}

export function subProfilesSelfCheck(): void {
  // The trap, spelled out. node-pg parses `date` into a JS Date at LOCAL
  // midnight; both naive conversions are wrong in ways that look fine.
  const d = new Date(2020, 7, 12);
  assert.equal(dateOnly(d), "2020-08-12");
  assert.notEqual(String(d), "2020-08-12", "String(Date) is not a date literal — this is the bug that NULLed every row");
  assert.equal(dateOnly("2020-08-12"), "2020-08-12");
  assert.equal(dateOnly("2020-08-12T00:00:00.000Z"), "2020-08-12");
  assert.equal(dateOnly(null), null);
  assert.equal(dateOnly(undefined), null);
  assert.equal(dateOnly(""), null);
  assert.equal(dateOnly("not a date"), null);
  // A single-digit month and day must still be zero-padded, or 2020-1-5 sorts
  // between 2020-10 and 2020-11.
  assert.equal(dateOnly(new Date(2020, 0, 5)), "2020-01-05");

  // §15 decision 2: one table, two categories, no third table.
  const targets = new Set(TABLES.map((t) => t.target));
  assert.equal(targets.size, 3, "four source tables, three targets — the two test tables share one");
  const testTargets = TABLES.filter((t) => t.target === "platform_user_language_tests");
  assert.deepEqual(testTargets.map((t) => t.extra?.category), ["'language'", "'academic'"]);

  // Timestamps are V3's, and user_id is resolved rather than copied.
  for (const c of ["user_id", "created_at", "updated_at", "deleted_at"]) assert.ok(NEVER.has(c));

  // The introspection contract: shared columns are written, orphans are refused.
  const src = new Set(["id", "user_id", "test_date", "created_at", "legacy"]);
  const tgt = new Set(["id", "user_id", "test_date", "created_at", "category"]);
  assert.deepEqual(intersectColumns(src, tgt, NEVER), ["id", "test_date"]);
  assert.deepEqual(unmappedColumns(src, tgt, NEVER), ["legacy"]);

  console.log(`w3-subprofiles self-check: ok — ${TABLES.length} source tables, ${targets.size} targets`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await runTransform({ wave: "W3-subprofiles", body: transformSubProfiles, selfCheck: subProfilesSelfCheck }));
}
