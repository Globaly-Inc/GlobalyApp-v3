import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";

export interface GuestSessionRow {
  id: number;
  fingerprint_hash: string;
  message_content: string | null;
  response_content: string | null;
  response_sources: unknown | null;
  embed_config_id: number | null;
  migrated_to_session_id: number | null;
  expires_at: Date;
  created_at: Date;
}

const TABLE = "ai_guest_chat_sessions";

export async function findByFingerprint(hash: string): Promise<GuestSessionRow | undefined> {
  return masterKnex(TABLE)
    .where({ fingerprint_hash: hash })
    .whereNull("migrated_to_session_id")
    .andWhere("expires_at", ">", masterKnex.fn.now())
    .first();
}

/** The most recent row for a fingerprint, migrated or not — used by /guest/migrate. */
export async function findLatestByFingerprint(hash: string): Promise<GuestSessionRow | undefined> {
  return masterKnex(TABLE)
    .where({ fingerprint_hash: hash })
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .first();
}

/**
 * Take the row's migration slot under a row lock.
 *
 * The lock, not the read, is what makes migration one-shot: two concurrent
 * migrations queue here, the first writes its session id, and the second re-reads
 * the committed value and gets back the id already there instead of claiming again.
 */
export async function lockForMigration(
  id: number,
  trx: Knex.Transaction,
): Promise<GuestSessionRow | undefined> {
  return trx(TABLE).where({ id }).forUpdate().first();
}

export async function create(data: {
  fingerprint_hash: string;
  message_content?: string;
  response_content?: string;
  response_sources?: unknown;
  embed_config_id?: number;
  expires_at: Date;
}): Promise<GuestSessionRow> {
  const [row] = await masterKnex(TABLE)
    .insert({
      fingerprint_hash: data.fingerprint_hash,
      message_content: data.message_content ?? null,
      response_content: data.response_content ?? null,
      response_sources: data.response_sources ? JSON.stringify(data.response_sources) : null,
      embed_config_id: data.embed_config_id ?? null,
      expires_at: data.expires_at,
    })
    .returning("*");
  return row;
}

export async function markMigrated(
  id: number,
  sessionId: number,
  trx?: Knex.Transaction,
): Promise<void> {
  await (trx ?? masterKnex)(TABLE).where({ id }).update({ migrated_to_session_id: sessionId });
}
