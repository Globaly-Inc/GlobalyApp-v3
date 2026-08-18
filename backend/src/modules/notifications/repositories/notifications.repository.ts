// Knex-only data access for the notification surface. Master schema — a
// notification is addressed to a platform_user, never to a tenant.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import type { Channel } from "../consts.js";

export type Db = Knex | Knex.Transaction;

export const db = (): Knex => masterKnex;

export interface NotificationRow {
  id: number;
  platform_user_id: number;
  type: string;
  title: string;
  body: string | null;
  reference_type: string | null;
  reference_id: string | null;
  dedupe_key: string;
  read_at: Date | null;
  created_at: Date;
}

export interface DeliveryRow {
  id: number;
  notification_id: number;
  channel: Channel;
  status: string;
  attempts: number;
  error: string | null;
  sent_at: Date | null;
}

// ── inbox ───────────────────────────────────────────────────────────────────

export function inboxQuery(userId: number, conn: Db = db()) {
  return conn("notifications").where({ platform_user_id: userId }).whereNull("deleted_at");
}

export async function unreadCount(userId: number, conn: Db = db()): Promise<number> {
  const row = await inboxQuery(userId, conn).whereNull("read_at").count({ count: "*" }).first();
  return Number(row?.count ?? 0);
}

export async function markRead(id: number, userId: number, conn: Db = db()): Promise<number> {
  return inboxQuery(userId, conn).where({ id }).whereNull("read_at").update({
    read_at: conn.fn.now(),
    updated_at: conn.fn.now(),
  });
}

export async function markAllRead(userId: number, conn: Db = db()): Promise<number> {
  return inboxQuery(userId, conn).whereNull("read_at").update({
    read_at: conn.fn.now(),
    updated_at: conn.fn.now(),
  });
}

export async function softDelete(id: number, userId: number, conn: Db = db()): Promise<number> {
  return inboxQuery(userId, conn).where({ id }).update({ deleted_at: conn.fn.now() });
}

// ── fan-out ─────────────────────────────────────────────────────────────────

/**
 * Insert-or-find, keyed on (platform_user_id, dedupe_key). Returns the row id
 * and whether this call is the one that created it — the worker uses `created`
 * only for logging, because the delivery insert below is independently
 * idempotent (a crash between the two must still converge).
 */
export async function upsertNotification(
  values: {
    platform_user_id: number;
    type: string;
    title: string;
    body: string | null;
    reference_type: string | null;
    reference_id: string | null;
    dedupe_key: string;
  },
  conn: Db = db(),
): Promise<{ id: number; created: boolean }> {
  const rows = await conn("notifications")
    .insert(values)
    .onConflict(["platform_user_id", "dedupe_key"])
    .ignore()
    .returning("id");

  if (rows.length > 0) return { id: Number(rows[0].id), created: true };

  const existing = await conn("notifications")
    .where({ platform_user_id: values.platform_user_id, dedupe_key: values.dedupe_key })
    .select("id")
    .first();
  return { id: Number(existing.id), created: false };
}

/** Claim a channel for a notification. False means another run already has it. */
export async function claimDelivery(
  notificationId: number,
  channel: Channel,
  conn: Db = db(),
): Promise<boolean> {
  const rows = await conn("notification_deliveries")
    .insert({ notification_id: notificationId, channel, status: "pending", attempts: 0 })
    .onConflict(["notification_id", "channel"])
    .ignore()
    .returning("id");
  return rows.length > 0;
}

/**
 * Record the outcome of one dispatch. `attempts` is incremented here rather than
 * at claim time so the column counts dispatches that actually happened — which
 * makes a double-dispatch visible in the ledger instead of invisible.
 */
export async function finishDelivery(
  notificationId: number,
  channel: Channel,
  status: "sent" | "skipped" | "failed",
  error: string | null,
  conn: Db = db(),
): Promise<void> {
  await conn("notification_deliveries")
    .where({ notification_id: notificationId, channel })
    .update({
      status,
      error,
      attempts: conn.raw("attempts + 1"),
      sent_at: status === "sent" ? conn.fn.now() : null,
      updated_at: conn.fn.now(),
    });
}

export async function listDeliveries(notificationId: number, conn: Db = db()): Promise<DeliveryRow[]> {
  return conn("notification_deliveries").where({ notification_id: notificationId }).orderBy("channel");
}

// ── preferences ─────────────────────────────────────────────────────────────

export async function listPreferences(userId: number, conn: Db = db()) {
  return conn("notification_preferences")
    .where({ platform_user_id: userId })
    .select("notification_type", "channel", "enabled")
    .orderBy(["notification_type", "channel"]);
}

/** The channel switches that apply to one notification type for one user. */
export async function preferencesFor(
  userId: number,
  notificationType: string,
  conn: Db = db(),
): Promise<Map<Channel, boolean>> {
  const rows = await conn("notification_preferences")
    .where({ platform_user_id: userId, notification_type: notificationType })
    .select("channel", "enabled");
  return new Map(rows.map((r) => [r.channel as Channel, r.enabled]));
}

export async function upsertPreference(
  userId: number,
  notificationType: string,
  channel: Channel,
  enabled: boolean,
  conn: Db = db(),
): Promise<void> {
  await conn("notification_preferences")
    .insert({ platform_user_id: userId, notification_type: notificationType, channel, enabled })
    .onConflict(["platform_user_id", "notification_type", "channel"])
    .merge({ enabled, updated_at: conn.fn.now() });
}

// ── push tokens ─────────────────────────────────────────────────────────────

export async function upsertPushToken(
  userId: number,
  token: string,
  userAgent: string | null,
  conn: Db = db(),
): Promise<void> {
  // Conflict on the token alone: FCM tokens are device-scoped, so re-registering
  // on a shared device must MOVE the token to the new user, not duplicate it.
  await conn("push_tokens")
    .insert({ platform_user_id: userId, token, user_agent: userAgent })
    .onConflict("token")
    .merge({
      platform_user_id: userId,
      user_agent: userAgent,
      last_seen_at: conn.fn.now(),
      deleted_at: null,
      updated_at: conn.fn.now(),
    });
}

export async function deletePushToken(userId: number, token: string, conn: Db = db()): Promise<number> {
  return conn("push_tokens").where({ platform_user_id: userId, token }).del();
}

export async function pushTokensFor(userId: number, conn: Db = db()): Promise<string[]> {
  const rows = await conn("push_tokens")
    .where({ platform_user_id: userId })
    .whereNull("deleted_at")
    .select("token");
  return rows.map((r) => r.token);
}

// ── recipients ──────────────────────────────────────────────────────────────

export async function recipientEmail(userId: number, conn: Db = db()): Promise<string | null> {
  const row = await conn("platform_users")
    .where({ id: userId })
    .whereNull("deleted_at")
    .select("email")
    .first();
  return row?.email ?? null;
}
