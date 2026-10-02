// Who answers a widget chat — the AI, a waiting room, or a staff member — and the staff actions
// that move it between them. Columns from the tenant migration 20261001_001.
//
// Every write here is its own statement, never folded into visitor.service's recordTurn: a tenant
// schema that has not taken the migration must lose the takeover bookkeeping, not the turn count
// that drives the contact and end-of-chat cards.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import { config as appConfig } from "../../../config.js";
import * as emailQueue from "../../enquiries/services/email-queue.service.js";

const TABLE = "ai_widget_visitors";

/** A staff member who stops replying, or a request nobody picks up, hands the chat back after this. */
export const IDLE_MS = 15 * 60_000;

/** The slice of the visitor row the Inbox reads as "who is answering". */
const CONTROL_COLUMNS = [
  "handled_by_user_id", "handled_by_name", "handled_at", "handoff_requested_at",
  "resolved_at", "resolved_by_name", "unread_count",
] as const;

export interface ControlRow {
  handled_by_user_id: number | null;
  handled_by_name: string | null;
  handled_at: Date | string | null;
  handoff_requested_at: Date | string | null;
  resolved_at: Date | string | null;
  resolved_by_name: string | null;
  unread_count: number;
}

export type Answerer = "ai" | "agent" | "waiting";

const since = (t: Date | string | null | undefined, now: number) =>
  t ? now - new Date(t).getTime() : Infinity;

/**
 * Who answers the visitor's next message, and which stale claims to clear first.
 *
 * Pure so the 15-minute rules can be tested without a database. A lagging tenant schema returns
 * these columns ABSENT, which reads as "nobody", i.e. the AI — exactly today's behaviour.
 */
export function whoAnswers(
  v: Partial<Pick<ControlRow, "handled_by_user_id" | "handled_at" | "handoff_requested_at">>,
  now = Date.now(),
): { answerer: Answerer; expireHandler: boolean; expireRequest: boolean } {
  const expireHandler = v.handled_by_user_id != null && since(v.handled_at, now) >= IDLE_MS;
  const expireRequest = v.handoff_requested_at != null && since(v.handoff_requested_at, now) >= IDLE_MS;
  const answerer: Answerer =
    v.handled_by_user_id != null && !expireHandler ? "agent"
      : v.handoff_requested_at != null && !expireRequest ? "waiting"
      : "ai";
  return { answerer, expireHandler, expireRequest };
}

/**
 * Stale claims off. Called by the guest route before it decides who answers.
 *
 * Each clear re-checks staleness IN the UPDATE, not just from the row the route read: a staff
 * member taking over (or a fresh handover request) between that read and this write sets a new
 * timestamp, and clearing by id alone would wipe the new claim and let the AI answer a chat
 * staff now hold. The SQL interval mirrors IDLE_MS.
 */
export async function expire(db: Knex, visitorId: number, what: { handler: boolean; request: boolean }) {
  const stale = (col: string) => `(${col} IS NULL OR ${col} < now() - interval '15 minutes')`;
  if (what.handler) {
    await db(TABLE).where({ id: visitorId }).whereRaw(stale("handled_at"))
      .update({ handled_by_user_id: null, handled_by_name: null, handled_at: null });
  }
  if (what.request) {
    await db(TABLE).where({ id: visitorId }).whereRaw(stale("handoff_requested_at"))
      .update({ handoff_requested_at: null });
  }
}

/** A visitor message staff haven't seen. Also reopens a resolved chat — they wrote again. */
export async function bumpUnread(db: Knex, visitorId: number) {
  await db(TABLE).where({ id: visitorId }).update({
    unread_count: db.raw("unread_count + 1"),
    resolved_at: null,
    resolved_by_name: null,
    resolved_by_user_id: null,
  });
}

/** The visitor asked for a person. Pauses the AI until someone joins or 15 minutes pass. */
export async function requestHandover(db: Knex, visitorId: number): Promise<boolean> {
  return (await db(TABLE).where({ id: visitorId }).whereNull("handled_by_user_id").update({ handoff_requested_at: db.fn.now() })) > 0;
}

export interface Staff {
  id: number;
  name: string;
}

/** The staff member's display name, from the token's user — never from the request body. */
export async function staffFor(userId: number): Promise<Staff> {
  const u = await masterKnex("platform_users").where({ id: userId }).first("first_name", "last_name", "email");
  const name = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
  return { id: userId, name: name || u?.email || "Team member" };
}

async function update(db: Knex, visitorId: number, patch: Record<string, unknown>): Promise<ControlRow | undefined> {
  const [row] = await db(TABLE).where({ id: visitorId }).update(patch).returning([...CONTROL_COLUMNS]);
  return row;
}

/** Fields that end a handover and a waiting request together. */
const takeOverPatch = (db: Knex, staff: Staff) => ({
  handled_by_user_id: staff.id,
  handled_by_name: staff.name,
  handled_at: db.fn.now(),
  handoff_requested_at: null,
  resolved_at: null,
  resolved_by_user_id: null,
  resolved_by_name: null,
  unread_count: 0,
});

/** Take over (`staff`) or hand back to the AI (`null`). */
export function setHandoff(db: Knex, visitorId: number, staff: Staff | null) {
  return update(db, visitorId, staff
    ? takeOverPatch(db, staff)
    : { handled_by_user_id: null, handled_by_name: null, handled_at: null, handoff_requested_at: null });
}

/**
 * A staff reply. Takes the chat if nobody holds it or the holder has gone quiet; a second member
 * replying to a chat someone else holds leaves the holder alone. Either way the idle clock restarts.
 *
 * CASE on the id and the name together so the CHECK pairing them can never see half a swap.
 */
export function claimForReply(db: Knex, visitorId: number, staff: Staff) {
  const free = `handled_by_user_id IS NULL OR handled_at < now() - interval '15 minutes'`;
  return update(db, visitorId, {
    ...takeOverPatch(db, staff),
    handled_by_user_id: db.raw(`CASE WHEN ${free} THEN ? ELSE handled_by_user_id END`, [staff.id]),
    handled_by_name: db.raw(`CASE WHEN ${free} THEN ? ELSE handled_by_name END`, [staff.name]),
    last_activity_at: db.fn.now(),
  });
}

/** Staff Resolve. Leaves conversation_state alone, so no summary email fires. */
export function setResolved(db: Knex, visitorId: number, staff: Staff, resolved: boolean) {
  return update(db, visitorId, resolved
    ? {
        resolved_at: db.fn.now(), resolved_by_user_id: staff.id, resolved_by_name: staff.name,
        handled_by_user_id: null, handled_by_name: null, handled_at: null, handoff_requested_at: null,
        unread_count: 0,
      }
    : { resolved_at: null, resolved_by_user_id: null, resolved_by_name: null });
}

export async function markRead(db: Knex, visitorId: number): Promise<boolean> {
  return (await db(TABLE).where({ id: visitorId }).update({ unread_count: 0 })) > 0;
}

/** The control fields plus `handled_by_me`, which only the server can answer. */
export function withMe<T extends Partial<ControlRow>>(row: T, userId: number): T & { handled_by_me: boolean } {
  return { ...row, handled_by_me: row.handled_by_user_id != null && Number(row.handled_by_user_id) === userId };
}

/**
 * The end-of-chat rating. Only on a chat the visitor actually ended — the next message reopens
 * it (recordTurn moves end_confirmed back to active), so a rating can't land mid-conversation.
 * A second rating for the same ending replaces the first.
 */
export async function recordRating(
  db: Knex,
  opts: { visitorKey: string; embedConfigId: number; rating: number; comment?: string },
): Promise<boolean> {
  const n = await db(TABLE)
    .where({ visitor_key: opts.visitorKey, embed_config_id: opts.embedConfigId, conversation_state: "end_confirmed" })
    .update({ rating: opts.rating, rating_comment: opts.comment || null, rated_at: db.fn.now() });
  return n > 0;
}

/** What the widget needs to draw the header and the waiting card. */
export async function widgetState(db: Knex, opts: { visitorKey: string; embedConfigId: number }) {
  const row = await db(TABLE)
    .where({ visitor_key: opts.visitorKey, embed_config_id: opts.embedConfigId })
    .first("handled_by_user_id", "handled_by_name", "handled_at", "handoff_requested_at");
  if (!row) return { agent_name: null, waiting: false };
  const { answerer } = whoAnswers(row);
  return { agent_name: answerer === "agent" ? (row.handled_by_name as string) : null, waiting: answerer === "waiting" };
}

/**
 * Email the org that a visitor is waiting for a person — the stand-in until there is an in-app
 * notification system. Same recipient rule as the enquiry notices: the org's own contact address
 * (a business falls back to its owner's), never a list of every member.
 *
 * One email per request: the dedup key carries the request's own timestamp, and a visitor who
 * keeps typing while they wait doesn't make a new request (whoAnswers says "waiting").
 */
export async function notifyHandoverRequest(
  config: { id: number; business_id: number | null; institution_id: number | null; display_name: string | null },
  visitor: { id: number; name?: string | null },
  message: string,
): Promise<void> {
  const recipients = config.institution_id != null
    ? (await emailQueue.resolveInstitutionRecipients(config.institution_id)).recipients
    : config.business_id != null
      ? (await emailQueue.resolveBusinessRecipients(config.business_id)).recipients
      : [];
  const requestedAt = Date.now();
  for (const r of recipients) {
    await emailQueue.enqueue({
      dedupKey: `handover_request:${config.id}:${visitor.id}:${requestedAt}:${r.email}`,
      template: "handover_request",
      recipientEmail: r.email,
      recipientUserId: r.userId ?? undefined,
      businessId: config.business_id ?? undefined,
      payload: {
        org_name: config.display_name,
        visitor_name: visitor.name ?? null,
        message,
        inbox_url: `${appConfig.WEB_APP_URL.replace(/\/$/, "")}/business/messages?visitor=${visitor.id}`,
      },
    });
  }
}
