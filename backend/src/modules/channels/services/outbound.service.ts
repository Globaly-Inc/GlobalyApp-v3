// Sending to a customer on WhatsApp, Instagram or Facebook through Zernio — AI replies, staff
// replies and WhatsApp templates all go through here, so the transcript and delivery tracking
// are written one way.

import type { Knex } from "knex";
import { BadRequestError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as messagesRepo from "../../ai-counsellor/repositories/messages.repository.js";
import * as embedRepo from "../../ai-counsellor/repositories/embed.repository.js";
import * as zernio from "../lib/zernio-client.js";
import * as connections from "../repositories/connections.repository.js";
import * as channelVisitors from "../repositories/channel-visitors.repository.js";
import type { Recipient } from "../../enquiries/shared/recipient.js";
import { WHATSAPP_WINDOW_MS } from "../consts.js";

const logger = createChildLogger("channels-outbound");

/**
 * The organisation's AI configuration and knowledge for its channels: its OLDEST widget config,
 * active or not. A channel conversation's visitor row is keyed on this id, so it must stay stable,
 * and switching the website widget off must not stop WhatsApp or mint a second widget.
 */
export async function channelConfigFor(owner: Recipient): Promise<embedRepo.EmbedConfigRow> {
  const all = await embedRepo.findByOwner(owner); // newest first
  return all[all.length - 1] ?? (await embedRepo.ensureForOwner(owner));
}

/** WhatsApp only: free-form messages are allowed within 24h of the customer's last message. */
export function windowOpen(visitor: channelVisitors.ChannelVisitorRow, now = Date.now()): boolean {
  if (visitor.channel !== "whatsapp") return true;
  return !!visitor.last_inbound_at && now - new Date(visitor.last_inbound_at).getTime() < WHATSAPP_WINDOW_MS;
}

export interface SendOpts {
  db: Knex;
  visitor: channelVisitors.ChannelVisitorRow;
  sessionId: number;
  role: "assistant" | "agent";
  content: string;
  sender?: { userId: number | null; name: string };
  attachments?: unknown[];
  /** Public URL of the first attachment, if any: Zernio fetches it. */
  attachmentUrl?: string;
  template?: { name: string; language: string; components?: unknown[] };
  /** Stable per logical send, so a retried job never delivers twice. */
  idempotencyKey: string;
  extra?: Partial<Parameters<typeof messagesRepo.create>[0]>;
}

/**
 * Stores the message as `queued` first (the Inbox shows it at once), then sends it. A Zernio or
 * Meta failure is recorded on the message ("Not delivered" + reason) rather than thrown, so a
 * failed send never loses what was written.
 */
export async function sendToCustomer(opts: SendOpts): Promise<messagesRepo.MessageRow> {
  const { db, visitor } = opts;
  if (!opts.template && !windowOpen(visitor)) {
    throw new BadRequestError("WhatsApp's 24-hour window has closed. Send an approved template instead.");
  }
  const row = await messagesRepo.create({
    session_id: opts.sessionId,
    role: opts.role,
    content: opts.content,
    attachments: opts.attachments,
    ...(opts.sender ? { sender_user_id: opts.sender.userId ?? undefined, sender_name: opts.sender.name } : {}),
    ...opts.extra,
    delivery_status: "queued",
  });
  await channelVisitors.recordOutbound(db, visitor.id);

  const conn = visitor.channel_connection_id != null ? await connections.findById(db, visitor.channel_connection_id) : undefined;
  if (!conn || conn.status !== "connected" || !visitor.zernio_conversation_id) {
    await messagesRepo.setDeliveryById(row.id, { delivery_status: "failed", delivery_error: "This channel is no longer connected." });
    return { ...row, delivery_status: "failed", delivery_error: "This channel is no longer connected." };
  }
  try {
    const { platformMessageId } = await zernio.sendMessage({
      conversationId: visitor.zernio_conversation_id,
      accountId: conn.zernio_account_id,
      text: opts.template ? undefined : opts.content,
      attachmentUrl: opts.attachmentUrl,
      template: opts.template,
      idempotencyKey: opts.idempotencyKey,
    });
    await messagesRepo.setDeliveryById(row.id, { provider_message_id: platformMessageId, delivery_status: "sent" });
    return { ...row, delivery_status: "sent" };
  } catch (err) {
    const reason = err instanceof Error ? err.message.replace(/^Zernio \S+ \S+ failed: /, "") : String(err);
    logger.warn("Send failed", { visitorId: visitor.id, reason });
    await messagesRepo.setDeliveryById(row.id, { delivery_status: "failed", delivery_error: reason.slice(0, 300) });
    return { ...row, delivery_status: "failed", delivery_error: reason };
  }
}

/** Best effort: "typing…" on the customer's side while AI writes. */
export async function showTyping(db: Knex, visitor: channelVisitors.ChannelVisitorRow): Promise<void> {
  if (!visitor.zernio_conversation_id || visitor.channel_connection_id == null) return;
  const conn = await connections.findById(db, visitor.channel_connection_id);
  if (!conn) return;
  await zernio.sendTyping(visitor.zernio_conversation_id, conn.zernio_account_id)
    .catch((err) => logger.debug("Typing indicator not sent", { err: err instanceof Error ? err.message : String(err) }));
}
