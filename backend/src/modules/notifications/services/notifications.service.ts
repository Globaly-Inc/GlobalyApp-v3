// The notification surface a signed-in person sees, plus publish() — the only
// way anything in the codebase asks for a notification to be sent.
//
// publish() does NOT fan out. It puts one message on LavinMQ and returns; the
// worker in src/workers/notification.worker.ts materialises rows and dispatches
// channels. A request never waits on N recipients × M channels.

import { z } from "zod";
import { NotFoundError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import { buildPaginatedResponse, paginationToOffset, type PaginationInput } from "../../../shared/pagination.js";
import { queueService } from "../../../shared/queue/queueService.js";
import { CHANNELS, NOTIFICATION_QUEUE, type Channel } from "../consts.js";
import * as repo from "../repositories/notifications.repository.js";
import { assertPushConfigured, getPushClient } from "./push.client.js";

const logger = createChildLogger("notifications");

/** Wire format of a fan-out message. Parsed by the worker before anything else. */
export const NotificationMessageSchema = z.object({
  platform_user_ids: z.array(z.number().int().positive()).min(1).max(1000),
  type: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  body: z.string().max(4000).nullable().default(null),
  reference_type: z.string().max(60).nullable().default(null),
  reference_id: z.string().max(100).nullable().default(null),
  /** Stable per logical event. Two publishes of the same key produce one notification. */
  dedupe_key: z.string().min(1).max(200),
});

export type NotificationMessage = z.infer<typeof NotificationMessageSchema>;

/**
 * Enqueue a fan-out. Never throws into the caller's request: a registration that
 * succeeded must not 500 because the broker blinked. The failure is logged at
 * error level with the full message so it can be replayed — the dedupe key makes
 * replay safe.
 */
export async function publish(message: NotificationMessage): Promise<boolean> {
  const payload = NotificationMessageSchema.parse(message);
  try {
    await queueService.publish(NOTIFICATION_QUEUE, payload);
    return true;
  } catch (err) {
    logger.error("Could not enqueue notification fan-out", {
      error: err instanceof Error ? err.message : String(err),
      dedupe_key: payload.dedupe_key,
      type: payload.type,
      recipients: payload.platform_user_ids.length,
    });
    return false;
  }
}

// ── inbox ───────────────────────────────────────────────────────────────────

function serialize(row: repo.NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    reference_type: row.reference_type,
    reference_id: row.reference_id,
    is_read: row.read_at !== null,
    read_at: row.read_at,
    created_at: row.created_at,
  };
}

export async function list(userId: number, query: PaginationInput & { unread?: boolean }) {
  const { limit, offset } = paginationToOffset(query);
  const base = () => {
    const q = repo.inboxQuery(userId);
    if (query.unread) q.whereNull("read_at");
    return q;
  };

  const [{ count }] = await base().count({ count: "*" });
  const rows: repo.NotificationRow[] = await base().select("*").orderBy("id", "desc").limit(limit).offset(offset);
  return buildPaginatedResponse(rows.map(serialize), Number(count), query);
}

export async function unreadCount(userId: number) {
  return { unread: await repo.unreadCount(userId) };
}

export async function markRead(id: number, userId: number) {
  const exists = await repo.inboxQuery(userId).where({ id }).select("id").first();
  if (!exists) throw new NotFoundError("Notification not found");
  await repo.markRead(id, userId);
}

export async function markAllRead(userId: number) {
  return { updated: await repo.markAllRead(userId) };
}

export async function remove(id: number, userId: number) {
  const deleted = await repo.softDelete(id, userId);
  if (deleted === 0) throw new NotFoundError("Notification not found");
}

// ── preferences ─────────────────────────────────────────────────────────────

export async function getPreferences(userId: number) {
  return { channels: [...CHANNELS], preferences: await repo.listPreferences(userId) };
}

export async function setPreferences(
  userId: number,
  entries: Array<{ notification_type: string; channel: Channel; enabled: boolean }>,
) {
  for (const entry of entries) {
    await repo.upsertPreference(userId, entry.notification_type, entry.channel, entry.enabled);
  }
  return getPreferences(userId);
}

// ── push tokens ─────────────────────────────────────────────────────────────

export async function registerPushToken(userId: number, token: string, userAgent: string | null) {
  await repo.upsertPushToken(userId, token, userAgent);
  return { registered: true as const };
}

export async function unregisterPushToken(userId: number, token: string) {
  const deleted = await repo.deletePushToken(userId, token);
  return { deleted: deleted > 0 };
}

/**
 * V2's /me/push-check smoke slice: push a test notification to the caller's own
 * devices and nowhere else.
 *
 * The registry read happens FIRST, so an unconfigured deployment still exercises
 * auth and the token lookup; only then does it refuse. assertPushConfigured()
 * throws 503 rather than reporting a send that did not happen.
 */
export async function pushCheck(userId: number) {
  const tokens = await repo.pushTokensFor(userId);
  assertPushConfigured();
  const result = await getPushClient().send(tokens, {
    title: "Globaly push check",
    body: "Web push is working on this device.",
  });
  for (const dead of result.invalidTokens) await repo.deletePushToken(userId, dead);
  return { sent: result.sent, pruned: result.invalidTokens.length };
}
