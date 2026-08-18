/**
 * W7d — events, notifications and the AI counsellor (Part 3 §4 W7).
 *
 * §4 W7 lists "events*, ai_counselor_*" after the services family. All eight
 * targets are live in `public` — D3 shipped the events and notifications tables,
 * E2 the counsellor pair — so per §4's closing rule ("every blocked mapping flips
 * to transform the moment its target schema merges") the six D3 entries flip here.
 *
 *   events                8 -> public.events                business_id -> host_org_*
 *   event_tickets         6 -> public.event_tickets         sold_count -> claimed_count
 *   event_registrations   4 -> public.event_registrations   is_read-style booleans -> timestamps
 *   event_updates         2 -> public.event_updates
 *   event_co_hosts        0 -> public.event_co_hosts        business_id -> co_host_org_*
 *   notifications        16 -> public.notifications         is_read -> read_at, + dedupe_key
 *   ai_counselor_sessions 75 -> public.ai_counselor_sessions
 *   ai_counselor_messages 301 -> public.ai_counselor_messages
 *
 * WHAT IS NOT HERE, AND WHY. ai_counselor_profiles (4), ai_message_attachments (2),
 * business_ai_sessions and business_ai_messages have NO V3 table — counsellor phase 2
 * is still in flight on dev-feat-ai-counsellor-p2 — so they stay `blocked` on E2
 * rather than being forced into a neighbouring table. Likewise training_* (E4) and
 * scribe_* (E3): every one of those thirteen tables is absent from the live V3
 * schema, so the scribe consent log — a legal record that must move verbatim — stays
 * blocked until E3 lands the table that can hold it verbatim. Copying a consent log
 * into an approximate shape is worse than not copying it yet.
 *
 * THE TWO COUNSELLOR TABLES HAVE NO v1_id COLUMN. Everything else in W7 upserts on
 * the preserved V1 uuid; E2's pair does not carry one, so the natural key is
 * (platform_user_id, created_at) for a session and (session_id, created_at) for a
 * message — the same shape W5 used for feed_posts, and verified unique across all
 * 75 and 301 V1 rows before the load. The uniqueness is re-checked at run time: if a
 * cutover re-extract ever produces a collision, two different messages would fuse
 * into one, so the wave refuses rather than guessing.
 *
 * FOUR VALUE SHAPES CHANGED, each spelled out as an override rather than hidden in
 * a cast:
 *   notifications.is_read boolean      -> read_at timestamptz (read at its created_at)
 *   notifications.reference_id uuid    -> reference_id text (V3 widened it)
 *   ai_counselor_messages.chips text[] -> jsonb
 *   ai_counselor_messages.feedback     -> V3's CHECK allows only positive|negative;
 *                                        V1's one non-null value is 'thumbs_up'
 *
 * Usage:
 *   node --import tsx scripts/migration/w7-engagement.ts --self-check
 *   node --import tsx scripts/migration/w7-engagement.ts             # dry run
 *   node --import tsx scripts/migration/w7-engagement.ts --apply
 */

import assert from "node:assert/strict";

import { ORG_ID, ORG_TYPE, USER_ID } from "./w7-orgs.js";
import {
  assertParentCounts,
  clearReport,
  execWrite,
  MigrationError,
  quoteIdent,
  reportUnresolvedQuery,
  runTransform,
  STAGING_SCHEMA,
  type TransformContext,
} from "./lib.js";

/** Every V1 table this wave reads, so a re-run replaces its verdict rather than appending one. */
export const W7_ENGAGEMENT_SOURCE_TABLES: readonly string[] = [
  "events",
  "event_tickets",
  "event_registrations",
  "event_updates",
  "event_co_hosts",
  "notifications",
  "ai_counselor_sessions",
  "ai_counselor_messages",
];

/** V1 event uuid -> public.events.id, through the v1_id this wave writes. */
export const EVENT_ID = (col: string): string => `(SELECT e.id FROM public.events e WHERE e.v1_id = ${col})`;

/** V1 ticket uuid -> public.event_tickets.id, through the v1_id this wave writes. */
export const TICKET_ID = (col: string): string => `(SELECT t.id FROM public.event_tickets t WHERE t.v1_id = ${col})`;

/**
 * V1's message feedback vocabulary as V3's.
 *
 * public.ai_counselor_messages declares CHECK (feedback IN ('positive','negative'))
 * and V1's one non-null value is 'thumbs_up'. The pair renames cleanly; anything
 * else becomes NULL and is reported as invalid_source_data rather than failing the
 * whole wave on a value nobody has seen yet.
 */
export const FEEDBACK = `(CASE s.feedback
   WHEN 'thumbs_up'   THEN 'positive'
   WHEN 'thumbs_down' THEN 'negative'
   WHEN 'positive'    THEN 'positive'
   WHEN 'negative'    THEN 'negative'
   ELSE NULL END)`;

/**
 * A V1 session's V3 id, resolved through the natural key.
 *
 * The counsellor pair has no v1_id column, so a message finds its session the same
 * way the session was upserted: (platform_user_id, created_at).
 */
export const SESSION_ID = (col: string): string =>
  `(SELECT t.id FROM public.ai_counselor_sessions t
      JOIN ${STAGING_SCHEMA}.ai_counselor_sessions vs ON vs.id = ${col}
     WHERE t.platform_user_id = ${USER_ID("vs.user_id")} AND t.created_at = vs.created_at)`;

/** One public table, loaded in a single statement, keyed on the V1 uuid in v1_id. */
async function loadPublic(
  ctx: TransformContext,
  spec: { table: string; select: Record<string, string>; where?: string },
): Promise<number> {
  const columns = Object.keys(spec.select).sort();
  const updates = columns.filter((c) => c !== "v1_id");
  return execWrite(
    ctx,
    `public.${spec.table}`,
    `INSERT INTO public.${quoteIdent(spec.table)} (${columns.map(quoteIdent).join(", ")})
     SELECT ${columns.map((c) => `${spec.select[c]} AS ${quoteIdent(c)}`).join(", ")}
       FROM ${STAGING_SCHEMA}.${quoteIdent(spec.table)} s
      ${spec.where ? `WHERE ${spec.where}` : ""}
     ON CONFLICT (v1_id) DO UPDATE SET
       ${updates.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(", ")}`,
  );
}

/**
 * Refuse to load a table whose natural key is not unique in the source.
 *
 * The counsellor pair upserts on a composite key rather than a preserved uuid, so
 * "these two columns identify a row" is an assumption — and one that a cutover
 * re-extract could break. Two rows collapsing onto one key is silent data loss, so
 * it stops the wave instead.
 */
async function assertNaturalKeyUnique(ctx: TransformContext, table: string, columns: readonly string[]): Promise<void> {
  const { rows } = await ctx.db.query<{ n: string }>(
    `SELECT count(*) AS n FROM (
       SELECT 1 FROM ${STAGING_SCHEMA}.${quoteIdent(table)}
        GROUP BY ${columns.map(quoteIdent).join(", ")} HAVING count(*) > 1) d`,
  );
  if (Number(rows[0].n) > 0) {
    throw new MigrationError(
      `${table}: ${rows[0].n} (${columns.join(", ")}) key(s) are not unique — the natural key this wave upserts on ` +
        `would collapse two different rows into one. public.${table} has no v1_id column, so this needs an owner ` +
        `decision (a v1_id column, or a different key) before W7 can load it.`,
    );
  }
}

export async function transformEngagement(ctx: TransformContext, allowedCodes: ReadonlySet<string>): Promise<void> {
  await clearReport(ctx, W7_ENGAGEMENT_SOURCE_TABLES);

  // ── events: business_id -> host_org_type/host_org_id ──────────────────────
  // host_org_* is NOT NULL, so an event whose host did not migrate is unloadable.
  // created_by is nullable in V3 (ON DELETE SET NULL): an event outlives the
  // account that created it, so an unresolved creator is a NULL plus a report.
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "events",
    targetTable: "public.events",
    column: "host_org_id",
    reasonCode: "unresolved_business",
    sql: `SELECT s.id::text, 'host ' || s.business_id::text || ' has no V3 business or institution'
            FROM ${STAGING_SCHEMA}.events s
           WHERE ${ORG_ID("s.business_id")} IS NULL`,
  });
  // rsvp_count has no V3 column: V3 counts public.event_registrations instead of
  // keeping a denormalised counter. Three V1 rows carry a non-zero value, so each
  // one is reported rather than quietly discarded — no_v3_column exists so a future
  // schema change can find the rows that wanted a column V3 does not have.
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "events",
    targetTable: "public.events",
    column: "rsvp_count",
    reasonCode: "no_v3_column",
    sql: `SELECT s.id::text, 'rsvp_count ' || s.rsvp_count::text || ' has no public.events column; V3 counts event_registrations'
            FROM ${STAGING_SCHEMA}.events s
           WHERE coalesce(s.rsvp_count, 0) <> 0`,
  });
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "events",
    targetTable: "public.events",
    column: "created_by",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'created_by ' || s.created_by::text || ' has no public.platform_users row'
            FROM ${STAGING_SCHEMA}.events s
           WHERE ${USER_ID("s.created_by")} IS NULL`,
  });
  await loadPublic(ctx, {
    table: "events",
    where: `${ORG_ID("s.business_id")} IS NOT NULL`,
    select: {
      v1_id: "s.id",
      host_org_type: ORG_TYPE("s.business_id"),
      host_org_id: ORG_ID("s.business_id"),
      created_by: USER_ID("s.created_by"),
      title: "s.title",
      slug: "s.slug",
      description: "s.description",
      summary: "s.summary",
      cover_image_url: "s.cover_image_url",
      event_type: "s.event_type",
      category: "s.category",
      status: "s.status",
      visibility: "s.visibility",
      target_audiences: "s.target_audiences",
      target_countries: "s.target_countries",
      venue_name: "s.venue_name",
      venue_address: "s.venue_address",
      venue_city: "s.venue_city",
      venue_country: "s.venue_country",
      venue_latitude: "s.venue_latitude",
      venue_longitude: "s.venue_longitude",
      online_url: "s.online_url",
      online_platform: "s.online_platform",
      starts_at: "s.starts_at",
      ends_at: "s.ends_at",
      timezone: "s.timezone",
      max_capacity: "s.max_capacity",
      registration_deadline: "s.registration_deadline",
      is_featured: "coalesce(s.is_featured, false)",
      tags: "s.tags",
      contact_email: "s.contact_email",
      contact_phone: "s.contact_phone",
      views_count: "coalesce(s.views_count, 0)",
      published_at: "s.published_at",
      cancelled_at: "s.cancelled_at",
      cancellation_reason: "s.cancellation_reason",
      settings: "coalesce(s.settings, '{}'::jsonb)",
      created_at: "coalesce(s.created_at, now())",
      updated_at: "coalesce(s.updated_at, now())",
    },
  });

  // ── the four event children, each behind the D8 guard ─────────────────────
  const eventParent = {
    label: "events",
    stagingTable: "events",
    targetTable: "public.events",
    targetFilter: "deleted_at IS NULL",
  };
  await assertParentCounts(ctx, "public.event_tickets", [eventParent]);
  await loadPublic(ctx, {
    table: "event_tickets",
    where: `${EVENT_ID("s.event_id")} IS NOT NULL`,
    select: {
      v1_id: "s.id",
      event_id: EVENT_ID("s.event_id"),
      name: "s.name",
      description: "s.description",
      price: "coalesce(s.price, 0)",
      currency: "coalesce(s.currency, 'USD')",
      quantity: "s.quantity",
      claimed_count: "coalesce(s.sold_count, 0)",
      max_per_order: "coalesce(s.max_per_order, 10)",
      sale_starts_at: "s.sale_starts_at",
      sale_ends_at: "s.sale_ends_at",
      is_active: "coalesce(s.is_active, true)",
      sort_order: "coalesce(s.sort_order, 0)",
      stripe_price_id: "s.stripe_price_id",
      created_at: "coalesce(s.created_at, now())",
      updated_at: "coalesce(s.updated_at, now())",
    },
  });

  await assertParentCounts(ctx, "public.event_registrations", [
    eventParent,
    {
      label: "platform_users",
      stagingTable: "auth_users",
      targetTable: "public.platform_users",
      targetFilter: "deleted_at IS NULL",
    },
  ]);
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "event_registrations",
    targetTable: "public.event_registrations",
    column: "platform_user_id",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'registrant ' || s.user_id::text || ' has no public.platform_users row'
            FROM ${STAGING_SCHEMA}.event_registrations s
           WHERE ${USER_ID("s.user_id")} IS NULL`,
  });
  await loadPublic(ctx, {
    table: "event_registrations",
    where: `${EVENT_ID("s.event_id")} IS NOT NULL AND ${USER_ID("s.user_id")} IS NOT NULL`,
    select: {
      v1_id: "s.id",
      event_id: EVENT_ID("s.event_id"),
      ticket_id: TICKET_ID("s.ticket_id"),
      platform_user_id: USER_ID("s.user_id"),
      status: "s.status",
      quantity: "coalesce(s.quantity, 1)",
      total_paid: "coalesce(s.total_paid, 0)",
      payment_status: "coalesce(s.payment_status, 'free')",
      stripe_session_id: "s.stripe_session_id",
      check_in_at: "s.check_in_at",
      cancelled_at: "s.cancelled_at",
      notes: "s.notes",
      created_at: "coalesce(s.created_at, now())",
      updated_at: "coalesce(s.updated_at, now())",
    },
  });

  await assertParentCounts(ctx, "public.event_updates", [eventParent]);
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "event_updates",
    targetTable: "public.event_updates",
    column: "author_id",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'author ' || s.author_id::text || ' has no public.platform_users row'
            FROM ${STAGING_SCHEMA}.event_updates s
           WHERE ${USER_ID("s.author_id")} IS NULL`,
  });
  await loadPublic(ctx, {
    table: "event_updates",
    where: `${EVENT_ID("s.event_id")} IS NOT NULL`,
    select: {
      v1_id: "s.id",
      event_id: EVENT_ID("s.event_id"),
      author_id: USER_ID("s.author_id"),
      title: "s.title",
      content: "s.content",
      created_at: "coalesce(s.created_at, now())",
    },
  });

  await assertParentCounts(ctx, "public.event_co_hosts", [eventParent]);
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "event_co_hosts",
    targetTable: "public.event_co_hosts",
    column: "co_host_org_id",
    reasonCode: "unresolved_business",
    sql: `SELECT s.id::text, 'co-host ' || s.business_id::text || ' has no V3 business or institution'
            FROM ${STAGING_SCHEMA}.event_co_hosts s
           WHERE ${ORG_ID("s.business_id")} IS NULL`,
  });
  await loadPublic(ctx, {
    table: "event_co_hosts",
    where: `${EVENT_ID("s.event_id")} IS NOT NULL AND ${ORG_ID("s.business_id")} IS NOT NULL`,
    select: {
      v1_id: "s.id",
      event_id: EVENT_ID("s.event_id"),
      co_host_org_type: ORG_TYPE("s.business_id"),
      co_host_org_id: ORG_ID("s.business_id"),
      invited_by: USER_ID("s.invited_by"),
      status: "s.status",
      role: "s.role",
      created_at: "coalesce(s.created_at, now())",
      updated_at: "coalesce(s.updated_at, now())",
    },
  });

  // ── notifications ─────────────────────────────────────────────────────────
  // Three shape changes: is_read -> read_at (a read notification was read when it
  // was created, which is the only timestamp V1 kept), reference_id uuid -> text
  // (V3 widened it so a reference can name a serial row too), and dedupe_key, which
  // V3 declares NOT NULL and V1 has no equivalent of — 'v1:<uuid>' makes each
  // migrated row its own dedupe class, so the loader can never collapse two
  // different V1 notifications onto one (platform_user_id, dedupe_key).
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "notifications",
    targetTable: "public.notifications",
    column: "platform_user_id",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'recipient ' || s.user_id::text || ' has no public.platform_users row'
            FROM ${STAGING_SCHEMA}.notifications s
           WHERE ${USER_ID("s.user_id")} IS NULL`,
  });
  await loadPublic(ctx, {
    table: "notifications",
    where: `${USER_ID("s.user_id")} IS NOT NULL`,
    select: {
      v1_id: "s.id",
      platform_user_id: USER_ID("s.user_id"),
      type: "s.type",
      title: "s.title",
      body: "s.body",
      reference_type: "s.reference_type",
      reference_id: "s.reference_id::text",
      dedupe_key: "'v1:' || s.id::text",
      read_at: "CASE WHEN coalesce(s.is_read, false) THEN s.created_at ELSE NULL END",
      created_at: "s.created_at",
    },
  });

  // ── the AI counsellor pair (no v1_id; composite natural keys) ─────────────
  await assertNaturalKeyUnique(ctx, "ai_counselor_sessions", ["user_id", "created_at"]);
  await assertNaturalKeyUnique(ctx, "ai_counselor_messages", ["session_id", "created_at"]);

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "ai_counselor_sessions",
    targetTable: "public.ai_counselor_sessions",
    column: "platform_user_id",
    reasonCode: "unresolved_user",
    sql: `SELECT s.id::text, 'session owner ' || s.user_id::text || ' has no public.platform_users row'
            FROM ${STAGING_SCHEMA}.ai_counselor_sessions s
           WHERE ${USER_ID("s.user_id")} IS NULL`,
  });
  // The composite key is a natural key but NOT a unique INDEX, so `ON CONFLICT`
  // has nothing to match. Update-then-insert-where-not-exists converges on exactly
  // the same rows — the pattern W5 used for feed_posts, for the same reason.
  const SESSION_SOURCE = `
    SELECT ${USER_ID("s.user_id")}      AS platform_user_id,
           s.title, s.message_count, s.credits_used,
           (s.archived_at IS NOT NULL)  AS is_archived,
           s.created_at, s.created_at   AS updated_at,
           s.deleted_at
      FROM ${STAGING_SCHEMA}.ai_counselor_sessions s
     WHERE ${USER_ID("s.user_id")} IS NOT NULL`;
  await execWrite(
    ctx,
    "public.ai_counselor_sessions (updated)",
    `UPDATE public.ai_counselor_sessions t
        SET title = f.title, message_count = f.message_count, credits_used = f.credits_used,
            is_archived = f.is_archived, updated_at = f.updated_at, deleted_at = f.deleted_at
       FROM (${SESSION_SOURCE}) f
      WHERE t.platform_user_id = f.platform_user_id AND t.created_at = f.created_at`,
  );
  await execWrite(
    ctx,
    "public.ai_counselor_sessions",
    `INSERT INTO public.ai_counselor_sessions
       (platform_user_id, title, message_count, credits_used, is_archived, created_at, updated_at, deleted_at)
     SELECT f.platform_user_id, f.title, f.message_count, f.credits_used, f.is_archived,
            f.created_at, f.updated_at, f.deleted_at
       FROM (${SESSION_SOURCE}) f
      WHERE NOT EXISTS (SELECT 1 FROM public.ai_counselor_sessions t
                         WHERE t.platform_user_id = f.platform_user_id AND t.created_at = f.created_at)`,
  );

  // No `deleted_at IS NULL` filter on the parent: 22 of the 75 V1 sessions are
  // soft-deleted and their deleted_at carries over, so they ARE migrated — filtering
  // them out would make the D8 guard report 22 phantom losses and refuse to load
  // messages that have a perfectly good parent.
  await assertParentCounts(ctx, "public.ai_counselor_messages", [
    {
      label: "ai_counselor_sessions",
      stagingTable: "ai_counselor_sessions",
      targetTable: "public.ai_counselor_sessions",
    },
  ]);
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "ai_counselor_messages",
    targetTable: "public.ai_counselor_messages",
    column: "feedback",
    reasonCode: "invalid_source_data",
    sql: `SELECT s.id::text, 'feedback ' || s.feedback || ' is not one of V3''s positive|negative'
            FROM ${STAGING_SCHEMA}.ai_counselor_messages s
           WHERE s.feedback IS NOT NULL AND ${FEEDBACK} IS NULL`,
  });
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "ai_counselor_messages",
    targetTable: "public.ai_counselor_messages",
    column: "session_id",
    reasonCode: "unresolved_parent",
    sql: `SELECT s.id::text, 'session ' || s.session_id::text || ' did not migrate to public.ai_counselor_sessions'
            FROM ${STAGING_SCHEMA}.ai_counselor_messages s
           WHERE ${SESSION_ID("s.session_id")} IS NULL`,
  });
  const MESSAGE_SOURCE = `
    SELECT ${SESSION_ID("s.session_id")}          AS session_id,
           s.role, s.content,
           coalesce(s.sources, '[]'::jsonb)       AS sources,
           coalesce(s.cards, '[]'::jsonb)         AS cards,
           coalesce(to_jsonb(s.chips), '[]'::jsonb) AS chips,
           ${FEEDBACK}                            AS feedback,
           s.prompt_tokens, s.completion_tokens, s.total_tokens, s.created_at
      FROM ${STAGING_SCHEMA}.ai_counselor_messages s
     WHERE ${SESSION_ID("s.session_id")} IS NOT NULL`;
  await execWrite(
    ctx,
    "public.ai_counselor_messages (updated)",
    `UPDATE public.ai_counselor_messages t
        SET role = f.role, content = f.content, sources = f.sources, cards = f.cards,
            chips = f.chips, feedback = f.feedback, prompt_tokens = f.prompt_tokens,
            completion_tokens = f.completion_tokens, total_tokens = f.total_tokens
       FROM (${MESSAGE_SOURCE}) f
      WHERE t.session_id = f.session_id AND t.created_at = f.created_at`,
  );
  await execWrite(
    ctx,
    "public.ai_counselor_messages",
    `INSERT INTO public.ai_counselor_messages
       (session_id, role, content, sources, cards, chips, feedback,
        prompt_tokens, completion_tokens, total_tokens, created_at)
     SELECT f.session_id, f.role, f.content, f.sources, f.cards, f.chips, f.feedback,
            f.prompt_tokens, f.completion_tokens, f.total_tokens, f.created_at
       FROM (${MESSAGE_SOURCE}) f
      WHERE NOT EXISTS (SELECT 1 FROM public.ai_counselor_messages t
                         WHERE t.session_id = f.session_id AND t.created_at = f.created_at)`,
  );

  ctx.report.notes.push(
    "training_* (E4), scribe_* (E3) and the counsellor phase-2 tables (E2) have no V3 table yet — still blocked, " +
      "not dropped; the scribe consent log is a legal record and moves verbatim or not at all",
  );
}

export function engagementSelfCheck(): void {
  const body = transformEngagement.toString().replace(/'/g, '"').replace(/\s+/g, " ");
  assert.equal(W7_ENGAGEMENT_SOURCE_TABLES.length, 8);
  for (const t of W7_ENGAGEMENT_SOURCE_TABLES) {
    assert.ok(
      new RegExp(`table: ?"${t}"|public\\.${t}`).test(body),
      `${t} must be loaded by this wave — its V3 target exists, so §4 flips it from blocked`,
    );
  }

  // The tables whose V3 target does NOT exist must not be touched. Forcing a
  // consent log or a training program into a neighbouring table is worse than
  // leaving it blocked.
  for (const t of [
    "scribe_consent_log",
    "scribe_sessions",
    "scribe_transcripts",
    "training_programs",
    "training_chapters",
    "ai_counselor_profiles",
    "ai_message_attachments",
    "business_ai_messages",
  ]) {
    assert.ok(!new RegExp(`"${t}"`).test(body), `${t} has no V3 table and must stay blocked`);
  }

  // The three org-owning tables resolve through the business+institution union;
  // host_org_* / co_host_org_* are NOT NULL, so an unresolved host skips the row.
  assert.ok(ORG_ID("x").includes("v1_business_id = x"));
  assert.ok(ORG_TYPE("x") !== ORG_ID("x"), "type and id are separate resolvers, resolved together");

  // notifications: the three shape changes must all be present.
  assert.ok(body.includes("v1:"), "dedupe_key is NOT NULL in V3 and derives from the V1 uuid");
  assert.ok(body.includes("s.reference_id::text"), "V3 widened reference_id from uuid to text");
  assert.ok(body.includes("read_at"), "is_read boolean becomes a read_at timestamp");

  // The feedback vocabulary: V3's CHECK allows only positive|negative.
  assert.ok(FEEDBACK.includes("'thumbs_up'") && FEEDBACK.includes("'positive'"), "V1's thumbs_up is V3's positive");
  assert.ok(FEEDBACK.includes("'thumbs_down'") && FEEDBACK.includes("'negative'"));
  assert.ok(
    FEEDBACK.includes("ELSE NULL"),
    "an unknown feedback value is NULLed and reported, never forced past the CHECK",
  );

  // The counsellor pair has no v1_id, so both resolvers go through the composite key.
  assert.ok(
    SESSION_ID("x").includes("t.created_at = vs.created_at"),
    "a message finds its session the way the session was keyed",
  );
  assert.ok(SESSION_ID("x").includes("platform_user_id"), "the session key is (platform_user_id, created_at)");
  for (const r of [EVENT_ID, TICKET_ID]) {
    assert.ok(r("x").includes("v1_id = x"), "the event tables DO carry v1_id and resolve through it");
    assert.ok(!r("x").includes("coalesce"), "an unresolved parent is reported, never defaulted");
  }

  console.log("w7-engagement self-check: ok");
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(
    await runTransform({ wave: "W7-engagement", body: transformEngagement, selfCheck: engagementSelfCheck }),
  );
}
