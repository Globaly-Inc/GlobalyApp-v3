// conversation_messages — master schema (public).
//
// Every read orders on the serial `id`, never on created_at. Two messages inserted in the
// same statement share a transaction timestamp to the microsecond, so a timestamp cursor
// can skip one; the PK cannot. (V2's messages.ts carried exactly that defect as a
// ponytail note — this is the fix, not a reinterpretation of the contract.)

import type { Knex } from "knex";

import { masterKnex } from "../../../core/db/master-pool.js";

export interface MessageRow {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string | null;
  message_type: string;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  created_at: Date;
}

export interface MessageInput {
  conversation_id: number;
  sender_id: number;
  content?: string | null;
  message_type?: string;
  file_url?: string | null;
  file_name?: string | null;
  file_size?: number | null;
}

const COLUMNS = [
  "m.id",
  "m.conversation_id",
  "m.sender_id",
  "m.content",
  "m.message_type",
  "m.file_url",
  "m.file_name",
  "m.file_size",
  "m.created_at",
] as const;

/** Sender display fields, so the client never has to resolve names itself. */
function hydrated(db: Knex) {
  return db("conversation_messages as m")
    .leftJoin("platform_users as u", "u.id", "m.sender_id")
    .whereNull("m.deleted_at")
    .select(
      ...COLUMNS,
      db.raw(`COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), 'User') AS sender_name`),
      "u.photo_url as sender_avatar",
    );
}

export async function insert(
  values: MessageInput,
  db: Knex | Knex.Transaction = masterKnex,
): Promise<MessageRow> {
  const [row] = await db<MessageRow>("conversation_messages").insert(values).returning("*");
  return row;
}

/**
 * One message in the same shape the history page and the SSE frames use. The send
 * response goes through this too: a POST that echoed the bare inserted row would give the
 * just-sent bubble a different shape from every other message until a reload.
 */
export function findHydrated(id: number, db: Knex = masterKnex) {
  return hydrated(db).where("m.id", id).first();
}

/** Highest live message id in a conversation — the paging anchor and the stream cursor. */
export async function maxId(conversationId: number, db: Knex = masterKnex): Promise<number> {
  const row = await db("conversation_messages")
    .where({ conversation_id: conversationId })
    .whereNull("deleted_at")
    .max<{ max: number | null }[]>("id as max");
  return Number(row[0]?.max ?? 0);
}

/** Newest-first page of history, bounded above by the anchor so pages never shift. */
export function history(
  conversationId: number,
  anchorId: number,
  page: { limit: number; offset: number },
  db: Knex = masterKnex,
) {
  return hydrated(db)
    .where("m.conversation_id", conversationId)
    .where("m.id", "<=", anchorId)
    .orderBy("m.id", "desc")
    .limit(page.limit)
    .offset(page.offset);
}

export async function countHistory(
  conversationId: number,
  anchorId: number,
  db: Knex = masterKnex,
): Promise<number> {
  const row = await db("conversation_messages")
    .where({ conversation_id: conversationId })
    .where("id", "<=", anchorId)
    .whereNull("deleted_at")
    .count<{ count: string }[]>("id as count");
  return Number(row[0]?.count ?? 0);
}

/** Oldest-first tail after a cursor — what each SSE tick pushes. */
export function since(conversationId: number, sinceId: number, limit: number, db: Knex = masterKnex) {
  return hydrated(db)
    .where("m.conversation_id", conversationId)
    .where("m.id", ">", sinceId)
    .orderBy("m.id", "asc")
    .limit(limit);
}
