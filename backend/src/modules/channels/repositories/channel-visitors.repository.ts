// Channel-specific writes on ai_widget_visitors (tenant). A WhatsApp, Instagram or Facebook
// conversation is a visitor row with `channel` set — see business/20261008_001.

import type { Knex } from "knex";
import type { VisitorRow } from "../../ai-counsellor/services/visitor.service.js";
import type { EscalationReason } from "../lib/escalation-detect.js";
import { PHONE_APP_HANDLER, type Channel } from "../consts.js";

const TABLE = "ai_widget_visitors";

export type AttentionReason = EscalationReason | "other_app" | "suggest";

export interface ChannelFields {
  channel: Channel | "ai_embed";
  channel_connection_id: number | null;
  zernio_conversation_id: string | null;
  channel_handle: string | null;
  last_inbound_at: Date | null;
  attention_reason: AttentionReason | null;
  ai_draft: string | null;
  /** A takeover column (not channel-specific), read when re-checking who answers before a send. */
  resolved_at?: Date | null;
}

export type ChannelVisitorRow = VisitorRow & ChannelFields;

export async function findByConversation(db: Knex, zernioConversationId: string): Promise<ChannelVisitorRow | undefined> {
  return db(TABLE).where({ zernio_conversation_id: zernioConversationId }).first();
}

export async function findById(db: Knex, id: number): Promise<ChannelVisitorRow | undefined> {
  return db(TABLE).where({ id }).first();
}

/**
 * Marks a freshly resolved visitor row as this channel conversation. Names and phone numbers
 * only fill gaps: what the customer told the AI later is never overwritten by a profile name.
 */
export async function attachChannel(db: Knex, id: number, f: {
  channel: Channel; channel_connection_id: number; zernio_conversation_id: string; channel_handle: string | null; name: string | null; phone: string | null;
}): Promise<ChannelVisitorRow> {
  const [row] = await db(TABLE).where({ id }).update({
    channel: f.channel,
    channel_connection_id: f.channel_connection_id,
    zernio_conversation_id: f.zernio_conversation_id,
    channel_handle: f.channel_handle,
    name: db.raw("COALESCE(name, CAST(? AS text))", [f.name]),
    phone: db.raw("COALESCE(phone, CAST(? AS text))", [f.phone]),
  }).returning("*");
  return row;
}

/** A customer message arrived: it counts, it's activity, and it reopens WhatsApp's 24h window. */
export async function recordInbound(db: Knex, id: number): Promise<void> {
  await db(TABLE).where({ id }).update({
    message_count: db.raw("message_count + 1"),
    last_activity_at: db.fn.now(),
    last_inbound_at: db.fn.now(),
  });
}

export async function recordOutbound(db: Knex, id: number): Promise<void> {
  await db(TABLE).where({ id }).update({ message_count: db.raw("message_count + 1"), last_activity_at: db.fn.now() });
}

export async function setAttention(db: Knex, id: number, reason: AttentionReason, draft: string | null = null): Promise<void> {
  await db(TABLE).where({ id }).update({ attention_reason: reason, ai_draft: draft, resolved_at: null, resolved_by_user_id: null, resolved_by_name: null });
}

export async function clearAttention(db: Knex, id: number): Promise<void> {
  await db(TABLE).where({ id }).update({ attention_reason: null, ai_draft: null });
}

/**
 * Someone replied from the WhatsApp Business phone app: a person is answering, so AI must not
 * talk over them. Same columns as a staff takeover, so the 15-minute resume applies unchanged.
 */
export async function setPhoneHandler(db: Knex, id: number): Promise<void> {
  await db(TABLE).where({ id }).update({
    handled_by_user_id: PHONE_APP_HANDLER.id,
    handled_by_name: PHONE_APP_HANDLER.name,
    handled_at: db.fn.now(),
    handoff_requested_at: null,
    attention_reason: null,
    resolved_at: null, resolved_by_user_id: null, resolved_by_name: null,
    last_activity_at: db.fn.now(),
  });
}

/** WhatsApp changed this customer's identifier (new number or business-scoped id). */
export async function rekeyHandle(db: Knex, channel: Channel, from: string, to: string): Promise<number> {
  return db(TABLE).where({ channel, channel_handle: from }).update({ channel_handle: to });
}
