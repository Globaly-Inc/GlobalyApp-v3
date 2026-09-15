// Widget contacts live in the OWNER'S tenant schema, so every query here takes the
// tenant Knex (req.db, or tenantDbFor on the unauthenticated guest path) instead of
// masterKnex. The schema is the scope: there is no owner column to filter on and no way
// for one business to read another's contacts.

import type { Knex } from "knex";

const TABLE = "ai_widget_contacts";

export interface WidgetContactRow {
  id: number;
  /** globalyapp.ai_counselor_sessions.id — the transcript, cross-schema, app-level FK. */
  session_id: number;
  embed_config_id: number;
  visitor_ip: string | null;
  visitor_user_agent: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  message_count: number;
  /** First seen / last seen. */
  created_at: Date;
  updated_at: Date;
}

/**
 * Record one turn against the visitor's contact row, creating it on their first message.
 *
 * The two COALESCEs run in opposite directions on purpose. Device and IP take the NEW value:
 * the latest is the one worth acting on, and a visitor who switches to their phone is still
 * the same contact. Email and phone keep the OLD one: a visitor who gives an address once and
 * then talks about visas for ten turns must not have it wiped by nine empty extractions.
 *
 * Upsert rather than read-then-write: two tabs on the same site are one contact, and the
 * unique (session_id) is what says so.
 */
export async function recordTurn(
  db: Knex,
  data: {
    sessionId: number;
    embedConfigId: number;
    ip?: string;
    userAgent?: string;
    email?: string;
    phone?: string;
  },
): Promise<void> {
  await db.raw(
    `INSERT INTO ${TABLE}
       (session_id, embed_config_id, visitor_ip, visitor_user_agent, visitor_email, visitor_phone, message_count)
     VALUES (?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT (session_id) DO UPDATE SET
       visitor_ip         = COALESCE(EXCLUDED.visitor_ip, ${TABLE}.visitor_ip),
       visitor_user_agent = COALESCE(EXCLUDED.visitor_user_agent, ${TABLE}.visitor_user_agent),
       visitor_email      = COALESCE(${TABLE}.visitor_email, EXCLUDED.visitor_email),
       visitor_phone      = COALESCE(${TABLE}.visitor_phone, EXCLUDED.visitor_phone),
       message_count      = ${TABLE}.message_count + 1,
       updated_at         = NOW()`,
    [
      data.sessionId,
      data.embedConfigId,
      data.ip ?? null,
      data.userAgent?.slice(0, 500) ?? null,
      data.email ?? null,
      data.phone ?? null,
    ],
  );
}

/** This tenant's contacts, most recently active first. */
export async function list(db: Knex, limit = 200): Promise<WidgetContactRow[]> {
  return db(TABLE).orderBy("updated_at", "desc").limit(limit).select("*");
}

/** The contact behind one transcript — also the ownership gate: a row in THIS schema
 *  is the only proof the session belongs to this tenant. */
export async function findBySession(db: Knex, sessionId: number): Promise<WidgetContactRow | undefined> {
  return db(TABLE).where({ session_id: sessionId }).first();
}
