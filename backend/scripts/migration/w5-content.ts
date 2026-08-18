/**
 * W5 — content & config (Part 3 §4 W5).
 *
 * Eight small tables, and almost every one of them is a RENAME plus an identity
 * remap rather than a copy:
 *
 *   feature_flags         -> superadmin.feature_flags        uuid PK -> serial, keyed on flag_key
 *   site_access_settings  -> superadmin.site_access_settings singleton row
 *   admin_logs            -> superadmin.admin_audit_logs     §4 rename; admin_id -> admin_users
 *   audit_events          -> public.audit_logs               §4 rename; four columns fold into details
 *   blog_keywords         -> superadmin.blog_keywords        uuid PK -> serial, keyed on keyword
 *   blog_posts            -> superadmin.blog_posts           uuid PK -> serial, keyed on slug
 *   feed_posts            -> public.feed_posts               users + businesses resolved
 *   feed_reactions        -> public.feed_reactions           junction (defect D8)
 *
 * feed_comments is NOT here. §3.5 has it MISSING and §6 wave D4 builds it; per §4
 * a blocked mapping flips to `transform` only once its target schema merges, so it
 * stays `disposition: "blocked"` in mapping.json with D4 named as the dependency.
 *
 * Two places where V1 has data V3 has no column for, and neither is silently
 * dropped:
 *
 *   audit_events.{event_category,outcome,user_email,user_agent} fold into
 *   audit_logs.details under v1_* keys. public.audit_logs models an ACTION, not an
 *   event pair, so the extra facts would otherwise be lost — and details is jsonb
 *   precisely so a record can carry what the columns do not.
 *
 *   admin_logs.ip_address has no home in superadmin.admin_audit_logs. All 129 V1
 *   rows have it NULL, so this is a declared drop rather than a loss; it is written
 *   down in mapping.json `dropped[]` where Gate 2 enforces the reason.
 *
 * The one row this wave can refuse: superadmin.admin_audit_logs.admin_id is NOT
 * NULL and references superadmin.admin_users. Eight of V1's 129 admin_logs rows
 * have a NULL admin_id — a system action with no actor — and there is no admin to
 * attribute them to. They are skipped and reason-coded `unresolved_user`, never
 * attributed to some arbitrary admin to make the FK happy.
 *
 * Usage:
 *   node --import tsx scripts/migration/w5-content.ts --self-check
 *   node --import tsx scripts/migration/w5-content.ts             # dry run
 *   node --import tsx scripts/migration/w5-content.ts --apply
 */

import assert from "node:assert/strict";

import { ADMIN_USER_ID, BUSINESS_ID, PLATFORM_USER_ID, copyTable } from "./w4-extraction.js";
import {
  assertParentCounts,
  assertTargetColumns,
  clearReport,
  execWrite,
  reportUnresolvedQuery,
  runTransform,
  STAGING_SCHEMA,
  type TransformContext,
} from "./lib.js";

/**
 * V1's audit_events carries four facts public.audit_logs has no column for.
 * details is jsonb, so they are folded in under v1_* keys rather than dropped —
 * "the schema has no column" is a reason to move a fact, not to lose it.
 * jsonb_strip_nulls keeps a row that had none of them byte-identical to its
 * source details.
 */
export const AUDIT_DETAILS = `(coalesce(s.details, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
   'v1_event_category', s.event_category,
   'v1_outcome',        s.outcome,
   'v1_user_email',     s.user_email,
   'v1_user_agent',     s.user_agent)))`;

/** Every V1 table this wave reads, so a re-run replaces its verdict rather than appending one. */
export const W5_SOURCE_TABLES: readonly string[] = [
  "feature_flags",
  "site_access_settings",
  "admin_logs",
  "audit_events",
  "blog_keywords",
  "blog_posts",
  "feed_posts",
  "feed_reactions",
];

export async function transformContent(ctx: TransformContext, allowedCodes: ReadonlySet<string>): Promise<void> {
  await clearReport(ctx, W5_SOURCE_TABLES);

  // ── feature_flags ─────────────────────────────────────────────────────────
  // updated_by is a platform_users id in V3 (routes pass req.auth.sub), not an
  // admin_users id — there is no FK to tell you that, so it is asserted here.
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "feature_flags",
    targetTable: "superadmin.feature_flags",
    column: "updated_by",
    reasonCode: "unresolved_user",
    sql: `SELECT s.flag_key, 'updated_by ' || s.updated_by::text || ' has no public.platform_users row'
            FROM ${STAGING_SCHEMA}.feature_flags s
           WHERE s.updated_by IS NOT NULL AND ${PLATFORM_USER_ID("s.updated_by")} IS NULL`,
  });
  await copyTable(ctx, {
    table: "feature_flags",
    targetSchema: "superadmin",
    conflict: ["flag_key"],
    never: ["id"],
    overrides: {
      is_enabled: "coalesce(s.is_enabled, false)",
      updated_by: PLATFORM_USER_ID("s.updated_by"),
    },
  });

  // ── site_access_settings (singleton) ──────────────────────────────────────
  // One row on both sides. V3 seeds id = 1 at migration time, so this converges
  // onto that row instead of inserting a second singleton.
  await assertTargetColumns(ctx.db, "superadmin", "site_access_settings", ["is_locked", "access_code", "updated_by", "updated_at"]);
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "site_access_settings",
    targetTable: "superadmin.site_access_settings",
    column: "updated_by",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'updated_by ' || s.updated_by::text || ' has no public.platform_users row'
            FROM ${STAGING_SCHEMA}.site_access_settings s
           WHERE s.updated_by IS NOT NULL AND ${PLATFORM_USER_ID("s.updated_by")} IS NULL`,
  });
  await execWrite(
    ctx,
    "superadmin.site_access_settings",
    `INSERT INTO superadmin.site_access_settings (id, is_locked, access_code, updated_by, updated_at)
     SELECT 1, s.is_locked, s.access_code, ${PLATFORM_USER_ID("s.updated_by")}, s.updated_at
       FROM ${STAGING_SCHEMA}.site_access_settings s
     ON CONFLICT (id) DO UPDATE SET
       is_locked = EXCLUDED.is_locked, access_code = EXCLUDED.access_code,
       updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
  );

  // ── admin_logs -> superadmin.admin_audit_logs (§4 rename) ─────────────────
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "admin_logs",
    targetTable: "superadmin.admin_audit_logs",
    column: "admin_id",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text,
                 CASE WHEN s.admin_id IS NULL
                      THEN 'admin_id is NULL (system action, no actor) and superadmin.admin_audit_logs.admin_id is NOT NULL'
                      ELSE 'admin ' || s.admin_id::text || ' has no superadmin.admin_users row' END
            FROM ${STAGING_SCHEMA}.admin_logs s
           WHERE ${ADMIN_USER_ID("s.admin_id")} IS NULL`,
  });
  await copyTable(ctx, {
    table: "admin_logs",
    targetTable: "admin_audit_logs",
    targetSchema: "superadmin",
    conflict: ["id"],
    never: ["ip_address"],
    where: `${ADMIN_USER_ID("s.admin_id")} IS NOT NULL`,
    overrides: {
      admin_id: ADMIN_USER_ID("s.admin_id"),
      details: "coalesce(s.details, '{}'::jsonb)",
    },
  });

  // ── audit_events -> public.audit_logs (§4 rename) ─────────────────────────
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "audit_events",
    targetTable: "public.audit_logs",
    column: "platform_user_id",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'user ' || s.user_id::text || ' has no public.platform_users row'
            FROM ${STAGING_SCHEMA}.audit_events s
           WHERE s.user_id IS NOT NULL AND ${PLATFORM_USER_ID("s.user_id")} IS NULL`,
  });
  await assertTargetColumns(ctx.db, "public", "audit_logs", [
    "id", "platform_user_id", "action", "entity_type", "entity_id", "details", "ip_address", "created_at",
  ]);
  await execWrite(
    ctx,
    "public.audit_logs",
    `INSERT INTO public.audit_logs (id, platform_user_id, action, entity_type, entity_id, details, ip_address, created_at)
     SELECT s.id, ${PLATFORM_USER_ID("s.user_id")}, s.event_type, s.resource, s.resource_id,
            ${AUDIT_DETAILS}, s.ip_address, s.created_at
       FROM ${STAGING_SCHEMA}.audit_events s
     ON CONFLICT (id) DO UPDATE SET
       platform_user_id = EXCLUDED.platform_user_id, action = EXCLUDED.action,
       entity_type = EXCLUDED.entity_type, entity_id = EXCLUDED.entity_id,
       details = EXCLUDED.details, ip_address = EXCLUDED.ip_address, created_at = EXCLUDED.created_at`,
  );

  // ── blog ──────────────────────────────────────────────────────────────────
  await copyTable(ctx, {
    table: "blog_keywords",
    targetSchema: "superadmin",
    conflict: ["keyword"],
    never: ["id", "search_volume", "relevance_score", "suggested_by_ai", "last_analyzed_at"],
    overrides: { is_active: "coalesce(s.is_active, true)" },
  });

  await copyTable(ctx, {
    table: "blog_posts",
    targetSchema: "superadmin",
    conflict: ["slug"],
    never: [
      "id",
      "image_url",
      "author_avatar",
      "read_time_minutes",
      "ai_generated",
      "generation_status",
      "generation_metadata",
      "reviewed_by",
      "reviewed_at",
    ],
    overrides: {
      tags: "to_jsonb(s.tags)",
      is_published: "coalesce(s.is_published, false)",
      views: "coalesce(s.views, 0)",
      reading_time_minutes: "coalesce(s.reading_time_minutes, 5)",
    },
  });

  // ── feed_posts ────────────────────────────────────────────────────────────
  // The author is NOT NULL on both sides: a post whose author did not migrate
  // cannot be attributed, so it is skipped and reported rather than reassigned.
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "feed_posts",
    targetTable: "public.feed_posts",
    column: "author_platform_user_id",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'author ' || s.author_user_id::text || ' has no public.platform_users row'
            FROM ${STAGING_SCHEMA}.feed_posts s
           WHERE ${PLATFORM_USER_ID("s.author_user_id")} IS NULL`,
  });
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "feed_posts",
    targetTable: "public.feed_posts",
    column: "business_id",
    reasonCode: "unresolved_business",
    sql: `SELECT s.id::text, 'business ' || s.business_id::text || ' did not migrate to public.businesses'
            FROM ${STAGING_SCHEMA}.feed_posts s
           WHERE s.business_id IS NOT NULL AND ${BUSINESS_ID("s.business_id")} IS NULL`,
  });

  // public.feed_posts has a serial PK and nowhere to keep the V1 uuid, so the
  // natural key is (author, created_at) — the pair Gate 2 also verifies on. An
  // author cannot post twice in the same microsecond, and the whole load is
  // re-checked against that assumption below.
  await assertTargetColumns(ctx.db, "public", "feed_posts", [
    "author_platform_user_id", "business_id", "post_type", "visibility", "content",
    "media", "is_pinned", "reactions_count", "created_at", "updated_at", "deleted_at",
  ]);
  const { rows: dupes } = await ctx.db.query<{ n: string }>(
    `SELECT count(*) AS n FROM (
       SELECT 1 FROM ${STAGING_SCHEMA}.feed_posts GROUP BY author_user_id, created_at HAVING count(*) > 1) d`,
  );
  if (Number(dupes[0].n) > 0) {
    throw new Error(
      `feed_posts: ${dupes[0].n} (author, created_at) pair(s) are not unique — the natural key this wave upserts on ` +
        `would collapse two different posts into one. Needs an owner decision before W5 can load feed_posts.`,
    );
  }

  const FEED_SOURCE = `
    SELECT ${PLATFORM_USER_ID("s.author_user_id")} AS author_platform_user_id,
           ${BUSINESS_ID("s.business_id")}         AS business_id,
           s.post_type, s.visibility, s.content,
           coalesce(s.media, '[]'::jsonb)          AS media,
           coalesce(s.is_pinned, false)            AS is_pinned,
           coalesce(s.reactions_count, 0)          AS reactions_count,
           s.created_at, s.updated_at,
           CASE WHEN coalesce(s.is_deleted, false) THEN s.updated_at ELSE NULL END AS deleted_at
      FROM ${STAGING_SCHEMA}.feed_posts s
     WHERE ${PLATFORM_USER_ID("s.author_user_id")} IS NOT NULL`;

  await execWrite(
    ctx,
    "public.feed_posts (updated)",
    `UPDATE public.feed_posts t
        SET business_id = f.business_id, post_type = f.post_type, visibility = f.visibility,
            content = f.content, media = f.media, is_pinned = f.is_pinned,
            reactions_count = f.reactions_count, updated_at = f.updated_at, deleted_at = f.deleted_at
       FROM (${FEED_SOURCE}) f
      WHERE t.author_platform_user_id = f.author_platform_user_id AND t.created_at = f.created_at`,
  );
  await execWrite(
    ctx,
    "public.feed_posts",
    `INSERT INTO public.feed_posts (author_platform_user_id, business_id, post_type, visibility, content,
                                    media, is_pinned, reactions_count, created_at, updated_at, deleted_at)
     SELECT f.* FROM (${FEED_SOURCE}) f
      WHERE NOT EXISTS (SELECT 1 FROM public.feed_posts t
                         WHERE t.author_platform_user_id = f.author_platform_user_id AND t.created_at = f.created_at)`,
  );

  // ── feed_reactions (junction, defect D8) ──────────────────────────────────
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "feed_reactions",
    targetTable: "public.feed_reactions",
    column: "platform_user_id",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'reacting user ' || s.user_id::text || ' has no public.platform_users row'
            FROM ${STAGING_SCHEMA}.feed_reactions s
           WHERE ${PLATFORM_USER_ID("s.user_id")} IS NULL`,
  });
  await assertParentCounts(ctx, "public.feed_reactions", [
    { label: "feed_posts", stagingTable: "feed_posts", targetTable: "public.feed_posts" },
    { label: "platform_users", stagingTable: "auth_users", targetTable: "public.platform_users", targetFilter: "deleted_at IS NULL" },
  ]);
  await execWrite(
    ctx,
    "public.feed_reactions",
    `INSERT INTO public.feed_reactions (post_id, platform_user_id, emoji, created_at)
     SELECT tp.id, ${PLATFORM_USER_ID("s.user_id")}, s.emoji, s.created_at
       FROM ${STAGING_SCHEMA}.feed_reactions s
       JOIN ${STAGING_SCHEMA}.feed_posts fp ON fp.id = s.post_id
       JOIN public.feed_posts tp
         ON tp.author_platform_user_id = ${PLATFORM_USER_ID("fp.author_user_id")} AND tp.created_at = fp.created_at
      WHERE ${PLATFORM_USER_ID("s.user_id")} IS NOT NULL
     ON CONFLICT (post_id, platform_user_id) DO UPDATE SET
       emoji = EXCLUDED.emoji, created_at = EXCLUDED.created_at`,
  );
}

export function contentSelfCheck(): void {
  // The four audit_events facts public.audit_logs has no column for must be
  // FOLDED, not lost. If any of these stops appearing, a fact is being dropped.
  for (const key of ["v1_event_category", "v1_outcome", "v1_user_email", "v1_user_agent"]) {
    assert.ok(AUDIT_DETAILS.includes(key), `audit_events.${key.slice(3)} must survive the rename into details`);
  }
  assert.ok(AUDIT_DETAILS.includes("jsonb_strip_nulls"), "a row with none of the extras keeps its details unchanged");
  assert.ok(AUDIT_DETAILS.includes("coalesce(s.details"), "a NULL details must not swallow the folded keys");

  // Two different id spaces that both look like `integer`, and no FK on some of
  // them to catch a mix-up: admin actions attribute to admin_users, product
  // actions to platform_users.
  assert.ok(ADMIN_USER_ID("x").includes("superadmin.admin_users"));
  assert.ok(PLATFORM_USER_ID("x").includes("mig.map_users"));
  assert.notEqual(ADMIN_USER_ID("x"), PLATFORM_USER_ID("x"));

  // feed_comments belongs to wave D4 and must not be loaded here (§4: a blocked
  // mapping flips to transform only once its target schema merges).
  assert.ok(!transformContent.toString().includes("feed_comments"), "feed_comments stays blocked on wave D4");

  console.log("w5-content self-check: ok");
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await runTransform({ wave: "W5-content", body: transformContent, selfCheck: contentSelfCheck }));
}
