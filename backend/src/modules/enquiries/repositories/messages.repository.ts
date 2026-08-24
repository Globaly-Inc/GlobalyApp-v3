// Enquiry chat messages — reads/writes globalyapp.enquiry_messages.
//
// A thread is identified by its distribution: `enquiry_distributions` already is one
// (enquiry, business) pair, so there is no conversation row to look up first. Same
// shape as other_service_order_messages, where the order is the thread.
//
// Authorization lives in messages.service.ts, not here — this module will happily read
// any thread it is handed.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";

const T = "enquiry_messages";

export interface EnquiryMessageRow {
  id: number;
  distribution_id: string;
  sender_id: number;
  body: string;
  created_at: Date;
  /** Null when not pinned to the conversation. Shared by both sides, unlike a star. */
  pinned_at: Date | null;
  /** Raw jsonb — storage paths only. The service signs them into URLs. */
  attachments: Array<{ storage_path: string; original_name: string; mime_type: string; size_bytes: number }> | null;
  /** Parent message when this is a thread reply. Threads are one level deep. */
  reply_to_id: number | null;
  /** Set once the sender has edited the body — drives V2's "(edited)" marker. */
  edited_at: Date | null;
  sender_name: string;
  /** Raw storage path on platform_users — the service signs it. */
  sender_photo_url: string | null;
}

// last_name is nullable on platform_users, so concat has to tolerate it — matches
// services.repository.ts's fullName().
const fullName = (alias: string) => `trim(concat(${alias}.first_name, ' ', coalesce(${alias}.last_name, '')))`;

const messageQuery = () =>
  masterKnex(`${T} as m`)
    .join("platform_users as u", "u.id", "m.sender_id")
    .select(
      "m.id",
      "m.distribution_id",
      "m.sender_id",
      "m.body",
      "m.created_at",
      "m.pinned_at",
      "m.attachments",
      "m.reply_to_id",
      "m.edited_at",
      "u.photo_url as sender_photo_url",
      masterKnex.raw(`${fullName("u")} as sender_name`),
    );

/**
 * The conversation's TOP-LEVEL messages, oldest first — a conversation reads top to
 * bottom.
 *
 * Replies are excluded: in GlobalyOS V2 a reply lives only in the thread panel, never
 * inline in the main list, and the parent's reply count is what tells you the thread is
 * there. Filtering here rather than in the client means the rows are never shipped just
 * to be thrown away.
 */
export async function listByDistribution(distributionId: string): Promise<EnquiryMessageRow[]> {
  return messageQuery()
    .where("m.distribution_id", distributionId)
    .whereNull("m.deleted_at")
    .whereNull("m.reply_to_id")
    .orderBy("m.created_at", "asc") as unknown as Promise<EnquiryMessageRow[]>;
}

/** The replies under one parent, oldest first — the thread panel's list. */
export async function listReplies(parentId: number): Promise<EnquiryMessageRow[]> {
  return messageQuery()
    .where("m.reply_to_id", parentId)
    .whereNull("m.deleted_at")
    .orderBy("m.created_at", "asc") as unknown as Promise<EnquiryMessageRow[]>;
}

/**
 * How many replies each message in this thread has, as a map. One grouped query for the
 * whole conversation rather than a count per row.
 */
export async function replyCountsIn(distributionId: string): Promise<Record<number, number>> {
  const rows = await masterKnex(`${T} as m`)
    .where("m.distribution_id", distributionId)
    .whereNull("m.deleted_at")
    .whereNotNull("m.reply_to_id")
    .groupBy("m.reply_to_id")
    .select("m.reply_to_id")
    .count("* as count");
  return Object.fromEntries(rows.map((r: any) => [Number(r.reply_to_id), Number(r.count)]));
}

export async function insert(data: {
  distribution_id: string;
  sender_id: number;
  body: string;
  attachments?: unknown[] | null;
  reply_to_id?: number | null;
}): Promise<EnquiryMessageRow> {
  const [inserted] = await masterKnex(T)
    // knex needs jsonb handed over as a JSON string, not a JS array.
    .insert({ ...data, attachments: data.attachments?.length ? JSON.stringify(data.attachments) : null })
    .returning("id");
  // Re-read through the join so the caller gets sender_name without a second shape.
  const row = await messageQuery().where("m.id", inserted.id).first();
  return row as EnquiryMessageRow;
}

/**
 * Same insert, on a caller's transaction — the unlock flow seeds the thread's opening
 * message and it must commit with the unlock, not separately. No re-read: the caller
 * doesn't need the row back, and the joined read wouldn't see an uncommitted insert.
 */
export async function insertInTrx(
  trx: Knex.Transaction,
  data: { distribution_id: string; sender_id: number; body: string },
): Promise<void> {
  await trx(T).insert(data);
}

/**
 * One message, unjoined — enough to find which conversation it belongs to and, for a
 * reply, which parent to anchor a further reply onto.
 */
export async function findById(
  id: number,
): Promise<
  { id: number; distribution_id: string; reply_to_id: number | null; sender_id: number } | undefined
> {
  // Soft-deleted rows are invisible here too, so editing or reacting to one 404s.
  return masterKnex(T)
    .where({ id })
    .whereNull("deleted_at")
    .first("id", "distribution_id", "reply_to_id", "sender_id");
}

/** Rewrites a message body and stamps edited_at. Ownership is checked in the service. */
export async function updateBody(id: number, body: string): Promise<EnquiryMessageRow> {
  await masterKnex(T).where({ id }).update({ body, edited_at: masterKnex.fn.now() });
  return (await messageQuery().where("m.id", id).first()) as EnquiryMessageRow;
}

/** Soft delete — the row leaves every read but stays on disk. */
export async function softDelete(id: number): Promise<void> {
  await masterKnex(T).where({ id }).update({ deleted_at: masterKnex.fn.now() });
}

/**
 * The distribution plus the parent enquiry's owner — everything the service needs to
 * decide who may read or write this thread, in one round trip.
 */
export async function findThreadContext(distributionId: string) {
  return masterKnex("enquiry_distributions as d")
    .join("enquiries as e", "e.id", "d.enquiry_id")
    .where("d.id", distributionId)
    .whereNull("d.deleted_at")
    .first(
      "d.id as distribution_id",
      "d.business_id",
      "d.status",
      "d.unlocked_at",
      "e.id as enquiry_id",
      "e.student_id",
    );
}

export interface ThreadSummaryRow {
  distribution_id: string;
  enquiry_id: string;
  status: string;
  unlocked_at: Date;
  business_name: string;
  logo_url: string | null;
  course_name: string;
  last_message_at: Date | null;
  /** Body of the newest message, for the conversation-list preview line. */
  last_message_body: string | null;
  /** True when the newest message is the student's own — the list prefixes it "You: ". */
  last_message_is_mine: boolean;
  /** Messages from the other side since this viewer's read cursor. */
  unread_count: number;
  favorited_at: Date | null;
}

/**
 * Every thread a student has, newest activity first — the inbox behind
 * /personal/messages. Only UNLOCKED distributions exist as threads, so the
 * `unlocked_at` filter is what makes a row a conversation.
 *
 * The newest message comes from a LATERAL rather than a grouped subquery because the
 * list now shows its body and sender too, not just its timestamp — and a lateral gets
 * all three from the same row the index already located.
 */
export async function listThreadsForStudent(studentId: number): Promise<ThreadSummaryRow[]> {
  // Read state is per viewer, so it LEFT joins — a thread the student has never
  // opened simply has no row, and every message in it counts as unread.
  const unread = masterKnex.raw(
    `(select count(*) from ${T} m
        where m.distribution_id = d.id
          and m.deleted_at is null
          and m.sender_id <> ?
          and (ts.last_read_at is null or m.created_at > ts.last_read_at))::int as unread_count`,
    [studentId],
  );

  return masterKnex("enquiry_distributions as d")
    .join("enquiries as e", "e.id", "d.enquiry_id")
    .join("businesses as b", "b.id", "d.business_id")
    .join("superadmin.extraction_courses as c", "c.id", "e.course_id")
    .joinRaw(
      `left join lateral (
         select lm.body, lm.sender_id, lm.created_at
           from ${T} lm
          where lm.distribution_id = d.id
            and lm.deleted_at is null
          order by lm.created_at desc
          limit 1
       ) lastmsg on true`,
    )
    .leftJoin("enquiry_thread_states as ts", (join) =>
      join.on("ts.distribution_id", "d.id").andOn("ts.user_id", masterKnex.raw("?", [studentId])),
    )
    .where("e.student_id", studentId)
    .whereNotNull("d.unlocked_at")
    .whereNull("d.deleted_at")
    .whereNull("e.deleted_at")
    .orderByRaw("coalesce(lastmsg.created_at, d.unlocked_at) desc")
    .select(
      "d.id as distribution_id",
      "e.id as enquiry_id",
      "d.status",
      "d.unlocked_at",
      "b.business_name",
      "b.logo_url",
      "c.name as course_name",
      "ts.favorited_at",
      masterKnex.raw("lastmsg.created_at as last_message_at"),
      masterKnex.raw("lastmsg.body as last_message_body"),
      masterKnex.raw("(lastmsg.sender_id = ?) as last_message_is_mine", [studentId]),
      unread,
    ) as unknown as Promise<ThreadSummaryRow[]>;
}

// ── Per-viewer thread state: read position + Favorites (enquiry_thread_states) ──
//
// One upsert helper rather than one per column: both writes are "remember this
// person's private view of this thread", and the row may not exist yet either way.

const STATES = "enquiry_thread_states";

async function upsertState(
  distributionId: string,
  userId: number,
  patch: { last_read_at?: Date | null; favorited_at?: Date | null },
): Promise<void> {
  await masterKnex(STATES)
    .insert({ distribution_id: distributionId, user_id: userId, ...patch })
    .onConflict(["distribution_id", "user_id"])
    .merge(patch);
}

/** Moves this viewer's read cursor to now. Idempotent — clicking a read thread is a no-op. */
export async function markThreadRead(distributionId: string, userId: number): Promise<void> {
  await upsertState(distributionId, userId, { last_read_at: new Date() });
}

/**
 * Flips the Favorites pin and reports the new state, so the caller doesn't need a
 * second read to know which way it went.
 */
export async function toggleFavorite(distributionId: string, userId: number): Promise<boolean> {
  const existing = await masterKnex(STATES)
    .where({ distribution_id: distributionId, user_id: userId })
    .first("favorited_at");
  const next = existing?.favorited_at ? null : new Date();
  await upsertState(distributionId, userId, { favorited_at: next });
  return next !== null;
}

// ── Reactions (enquiry_message_reactions) ──

const REACTIONS = "enquiry_message_reactions";

export interface ReactionRow {
  message_id: number;
  emoji: string;
  user_id: number;
  reactor_name: string;
}

/**
 * Every reaction on these messages, with the reactor's name for the chip's tooltip.
 * One round trip for a whole thread rather than one per message.
 */
export async function listReactionsIn(messageIds: number[]): Promise<ReactionRow[]> {
  if (messageIds.length === 0) return [];
  return masterKnex(`${REACTIONS} as r`)
    .join("platform_users as u", "u.id", "r.user_id")
    .whereIn("r.message_id", messageIds)
    .orderBy("r.created_at", "asc")
    .select("r.message_id", "r.emoji", "r.user_id", masterKnex.raw(`${fullName("u")} as reactor_name`)) as unknown as Promise<
    ReactionRow[]
  >;
}

/** Toggles one (message, user, emoji) row, reporting whether it now exists. */
export async function toggleReaction(messageId: number, userId: number, emoji: string): Promise<boolean> {
  const deleted = await masterKnex(REACTIONS).where({ message_id: messageId, user_id: userId, emoji }).del();
  if (deleted > 0) return false;
  await masterKnex(REACTIONS).insert({ message_id: messageId, user_id: userId, emoji });
  return true;
}

// ── Message stars (enquiry_message_stars) ──

const STARS = "enquiry_message_stars";

/** Which of these messages this viewer has starred — one round trip for a whole thread. */
export async function listStarredIdsIn(messageIds: number[], userId: number): Promise<number[]> {
  if (messageIds.length === 0) return [];
  const rows = await masterKnex(STARS).where("user_id", userId).whereIn("message_id", messageIds).select("message_id");
  return rows.map((r) => r.message_id as number);
}

/**
 * Flips the conversation-level pin, reporting the state it landed in. Written as one
 * conditional UPDATE so two people pinning at once can't lose each other's write to a
 * read-then-write race.
 */
export async function togglePin(messageId: number, userId: number): Promise<boolean> {
  const [row] = await masterKnex(T)
    .where({ id: messageId })
    .update({
      pinned_at: masterKnex.raw("case when pinned_at is null then now() else null end"),
      // ?::int, not a bare ?: both CASE branches would otherwise be untyped (`null`
      // says nothing, and a bound parameter defaults to text), so Postgres resolves the
      // expression to text and refuses to assign it to an integer column.
      pinned_by: masterKnex.raw("case when pinned_at is null then ?::int else null end", [userId]),
    })
    .returning("pinned_at");
  return row?.pinned_at != null;
}

export async function toggleStar(messageId: number, userId: number): Promise<boolean> {
  const deleted = await masterKnex(STARS).where({ message_id: messageId, user_id: userId }).del();
  if (deleted > 0) return false;
  await masterKnex(STARS).insert({ message_id: messageId, user_id: userId });
  return true;
}

export interface StarredMessageRow extends EnquiryMessageRow {
  starred_at: Date;
  business_name: string;
  course_name: string;
}

/**
 * Every message this student has starred, newest star first — the Starred view.
 * Joined back through the distribution so each row can name the conversation it
 * came from, the way V2's StarredView badges each hit with its chat name.
 */
export async function listStarredForStudent(userId: number): Promise<StarredMessageRow[]> {
  return messageQuery()
    .join(`${STARS} as st`, "st.message_id", "m.id")
    .join("enquiry_distributions as d", "d.id", "m.distribution_id")
    .join("businesses as b", "b.id", "d.business_id")
    .join("enquiries as e", "e.id", "d.enquiry_id")
    .join("superadmin.extraction_courses as c", "c.id", "e.course_id")
    .where("st.user_id", userId)
    .whereNull("m.deleted_at")
    .orderBy("st.created_at", "desc")
    .select("st.created_at as starred_at", "b.business_name", "c.name as course_name") as unknown as Promise<
    StarredMessageRow[]
  >;
}
