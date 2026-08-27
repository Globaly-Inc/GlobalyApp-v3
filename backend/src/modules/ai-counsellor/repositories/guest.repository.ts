import { masterKnex } from "../../../core/db/master-pool.js";

export interface GuestSessionRow {
  id: number;
  fingerprint_hash: string;
  ip_hash: string | null;
  message_content: string | null;
  response_content: string | null;
  response_sources: unknown | null;
  embed_config_id: number | null;
  migrated_to_session_id: number | null;
  expires_at: Date;
  created_at: Date;
}

const TABLE = "ai_guest_chat_sessions";

/** Gate check: blocks if this fingerprint OR this IP has already had a reply. */
export async function findByFingerprintOrIp(
  fingerprintHash: string,
  ipHash: string,
): Promise<GuestSessionRow | undefined> {
  return masterKnex(TABLE)
    .where(function () {
      this.where({ fingerprint_hash: fingerprintHash }).orWhere({ ip_hash: ipHash });
    })
    .whereNull("migrated_to_session_id")
    .andWhere("expires_at", ">", masterKnex.fn.now())
    .first();
}

/** Migration lookup: find by exact fingerprint_hash (the value the client echoes back). */
export async function findByFingerprint(fingerprintHash: string): Promise<GuestSessionRow | undefined> {
  return masterKnex(TABLE)
    .where({ fingerprint_hash: fingerprintHash })
    .whereNull("migrated_to_session_id")
    .andWhere("expires_at", ">", masterKnex.fn.now())
    .first();
}

export async function create(data: {
  fingerprint_hash: string;
  ip_hash?: string;
  message_content?: string;
  response_content?: string;
  response_sources?: unknown;
  embed_config_id?: number;
  expires_at: Date;
}): Promise<GuestSessionRow> {
  const [row] = await masterKnex(TABLE)
    .insert({
      fingerprint_hash: data.fingerprint_hash,
      ip_hash: data.ip_hash ?? null,
      message_content: data.message_content ?? null,
      response_content: data.response_content ?? null,
      response_sources: data.response_sources ? JSON.stringify(data.response_sources) : null,
      embed_config_id: data.embed_config_id ?? null,
      expires_at: data.expires_at,
    })
    .returning("*");
  return row;
}

export async function markMigrated(id: number, sessionId: number): Promise<void> {
  await masterKnex(TABLE).where({ id }).update({ migrated_to_session_id: sessionId });
}
