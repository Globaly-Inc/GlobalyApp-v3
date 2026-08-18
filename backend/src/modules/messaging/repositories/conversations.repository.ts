// Conversations + participants. Master schema (public) only — a conversation spans a
// student and one or more businesses, so it cannot live in a tenant schema.
//
// V3 has no RLS: every read here carries its own participant predicate. That WHERE clause
// is the entire ownership boundary.

import type { Knex } from "knex";

import { masterKnex } from "../../../core/db/master-pool.js";

export interface ConversationRow {
  id: number;
  enquiry_id: number | null;
  title: string | null;
  status: string;
  created_by: number;
  closed_by: number | null;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ParticipantRow {
  id: number;
  conversation_id: number;
  platform_user_id: number;
  role: string;
  business_id: number | null;
  is_active: boolean;
  left_at: Date | null;
  last_read_message_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export type ParticipantRole = "student" | "agent_member" | "provider_member";

/** The caller's ACTIVE seat in a conversation, or undefined. The guard for every route. */
export function findActiveParticipant(
  conversationId: number,
  platformUserId: number,
  db: Knex = masterKnex,
): Promise<ParticipantRow | undefined> {
  return db<ParticipantRow>("conversation_participants")
    .where({ conversation_id: conversationId, platform_user_id: platformUserId, is_active: true })
    .whereNull("deleted_at")
    .first();
}

/** Any seat, active or not — the invite flow re-activates a participant who left. */
export function findParticipant(
  conversationId: number,
  platformUserId: number,
  db: Knex = masterKnex,
): Promise<ParticipantRow | undefined> {
  return db<ParticipantRow>("conversation_participants")
    .where({ conversation_id: conversationId, platform_user_id: platformUserId })
    .whereNull("deleted_at")
    .first();
}

export function findById(conversationId: number, db: Knex = masterKnex): Promise<ConversationRow | undefined> {
  return db<ConversationRow>("conversations").where({ id: conversationId }).whereNull("deleted_at").first();
}

export function findByEnquiry(enquiryId: number, db: Knex = masterKnex): Promise<ConversationRow | undefined> {
  return db<ConversationRow>("conversations").where({ enquiry_id: enquiryId }).whereNull("deleted_at").first();
}

/**
 * The caller's conversations, newest activity first, each with its unread count.
 *
 * Unread is `messages above my read watermark that I did not send` — one indexed range
 * scan per row over (conversation_id, id), no per-message receipt rows to join.
 */
export function listForUser(
  platformUserId: number,
  page: { limit: number; offset: number },
  db: Knex = masterKnex,
) {
  return db("conversation_participants as p")
    .join("conversations as c", function join() {
      this.on("c.id", "p.conversation_id").andOnNull("c.deleted_at");
    })
    .joinRaw(
      `LEFT JOIN LATERAL (
         SELECT m.id, m.content, m.message_type, m.sender_id, m.created_at
         FROM conversation_messages m
         WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
         ORDER BY m.id DESC LIMIT 1
       ) lm ON TRUE`,
    )
    .where("p.platform_user_id", platformUserId)
    .where("p.is_active", true)
    .whereNull("p.deleted_at")
    .orderBy("c.updated_at", "desc")
    .orderBy("c.id", "desc")
    .limit(page.limit)
    .offset(page.offset)
    .select(
      "c.id",
      "c.enquiry_id",
      "c.title",
      "c.status",
      "c.created_at",
      "c.updated_at",
      "p.role as my_role",
      "p.business_id as my_business_id",
      "p.last_read_message_id",
      db.raw(
        `(SELECT COUNT(*)::int FROM conversation_messages m
            WHERE m.conversation_id = c.id
              AND m.deleted_at IS NULL
              AND m.sender_id <> p.platform_user_id
              AND m.id > COALESCE(p.last_read_message_id, 0)) AS unread_count`,
      ),
      db.raw(
        `CASE WHEN lm.id IS NULL THEN NULL ELSE
           json_build_object('id', lm.id, 'content', lm.content, 'message_type', lm.message_type,
                             'sender_id', lm.sender_id, 'created_at', lm.created_at)
         END AS last_message`,
      ),
    );
}

export async function countForUser(platformUserId: number, db: Knex = masterKnex): Promise<number> {
  const row = await db("conversation_participants as p")
    .join("conversations as c", function join() {
      this.on("c.id", "p.conversation_id").andOnNull("c.deleted_at");
    })
    .where("p.platform_user_id", platformUserId)
    .where("p.is_active", true)
    .whereNull("p.deleted_at")
    .count<{ count: string }[]>("c.id as count");
  return Number(row[0]?.count ?? 0);
}

/** Participants of a conversation, with the display fields the thread header needs. */
export function listParticipants(conversationId: number, db: Knex = masterKnex) {
  return db("conversation_participants as p")
    .leftJoin("platform_users as u", "u.id", "p.platform_user_id")
    .leftJoin("businesses as b", "b.id", "p.business_id")
    .where("p.conversation_id", conversationId)
    .whereNull("p.deleted_at")
    .orderBy("p.id")
    .select(
      "p.id",
      "p.platform_user_id",
      "p.role",
      "p.business_id",
      "p.is_active",
      "u.first_name",
      "u.last_name",
      "u.photo_url",
      "b.business_name",
    );
}

export async function createConversation(
  values: { enquiry_id: number | null; title: string | null; created_by: number },
  db: Knex | Knex.Transaction = masterKnex,
): Promise<ConversationRow> {
  const [row] = await db<ConversationRow>("conversations").insert(values).returning("*");
  return row;
}

export async function addParticipants(
  rows: { conversation_id: number; platform_user_id: number; role: ParticipantRole; business_id: number | null }[],
  db: Knex | Knex.Transaction = masterKnex,
): Promise<ParticipantRow[]> {
  return db<ParticipantRow>("conversation_participants").insert(rows).returning("*");
}

export async function reactivateParticipant(
  participantId: number,
  db: Knex | Knex.Transaction = masterKnex,
): Promise<ParticipantRow> {
  const [row] = await db<ParticipantRow>("conversation_participants")
    .where({ id: participantId })
    .update({ is_active: true, left_at: null, updated_at: db.fn.now() })
    .returning("*");
  return row;
}

/** Moves the caller's read watermark forward. Never backwards — re-reading is idempotent. */
export async function markRead(
  conversationId: number,
  platformUserId: number,
  messageId: number,
  db: Knex = masterKnex,
): Promise<void> {
  await db("conversation_participants")
    .where({ conversation_id: conversationId, platform_user_id: platformUserId })
    .where((q) => q.whereNull("last_read_message_id").orWhere("last_read_message_id", "<", messageId))
    .update({ last_read_message_id: messageId, updated_at: db.fn.now() });
}

export async function countUnread(
  conversationId: number,
  platformUserId: number,
  db: Knex = masterKnex,
): Promise<number> {
  const row = await db("conversation_participants as p")
    .where({ "p.conversation_id": conversationId, "p.platform_user_id": platformUserId })
    .first<{ unread: number }>(
      db.raw(
        `(SELECT COUNT(*)::int FROM conversation_messages m
            WHERE m.conversation_id = p.conversation_id
              AND m.deleted_at IS NULL
              AND m.sender_id <> p.platform_user_id
              AND m.id > COALESCE(p.last_read_message_id, 0)) AS unread`,
      ),
    );
  return Number(row?.unread ?? 0);
}

/** Bumps the conversation so the list re-sorts without touching the message table. */
export async function touch(
  conversationId: number,
  db: Knex | Knex.Transaction = masterKnex,
): Promise<void> {
  await db("conversations").where({ id: conversationId }).update({ updated_at: db.fn.now() });
}
