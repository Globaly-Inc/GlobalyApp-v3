// The body of the notification worker, kept out of the worker file so it can be
// tested by calling it — no broker, no process, no timing.
//
// IDEMPOTENCE IS STRUCTURAL. Two guarantees, neither of which is a
// read-then-decide check:
//
//   notifications           UNIQUE (platform_user_id, dedupe_key)
//   notification_deliveries UNIQUE (notification_id, channel)
//
// A redelivered message therefore inserts nothing twice, and — because the
// second insert of a delivery row loses the race rather than succeeding — it
// also dispatches nothing twice. A crash between the two inserts converges on
// the next delivery instead of duplicating.

import { createChildLogger } from "../../../shared/logger.js";
import { queueService } from "../../../shared/queue/queueService.js";
import { CHANNELS, DEFAULT_CHANNEL_ENABLED, type Channel } from "../consts.js";
import * as repo from "../repositories/notifications.repository.js";
import { getPushClient, isPushAvailable } from "./push.client.js";
import { NotificationMessageSchema, type NotificationMessage } from "./notifications.service.js";

const logger = createChildLogger("notification-fanout");

export interface FanoutResult {
  notifications_created: number;
  notifications_existing: number;
  dispatched: Record<Channel, number>;
  skipped: Record<Channel, number>;
}

function emptyCounts(): Record<Channel, number> {
  return { in_app: 0, email: 0, push: 0 };
}

/** Preference row if there is one, otherwise the module default. */
async function enabledChannels(userId: number, type: string): Promise<Channel[]> {
  const prefs = await repo.preferencesFor(userId, type);
  return CHANNELS.filter((c) => prefs.get(c) ?? DEFAULT_CHANNEL_ENABLED[c]);
}

export async function fanout(raw: unknown): Promise<FanoutResult> {
  const message: NotificationMessage = NotificationMessageSchema.parse(raw);
  const result: FanoutResult = {
    notifications_created: 0,
    notifications_existing: 0,
    dispatched: emptyCounts(),
    skipped: emptyCounts(),
  };

  // Deduplicate the recipient list itself — a caller passing the same id twice
  // would otherwise take the "already exists" branch and look like a replay.
  for (const userId of new Set(message.platform_user_ids)) {
    const { id, created } = await repo.upsertNotification({
      platform_user_id: userId,
      type: message.type,
      title: message.title,
      body: message.body,
      reference_type: message.reference_type,
      reference_id: message.reference_id,
      dedupe_key: message.dedupe_key,
    });
    if (created) result.notifications_created += 1;
    else result.notifications_existing += 1;

    for (const channel of await enabledChannels(userId, message.type)) {
      // Losing this race means another run already owns the channel.
      if (!(await repo.claimDelivery(id, channel))) continue;
      const outcome = await dispatch(channel, id, userId, message);
      if (outcome.status === "sent") result.dispatched[channel] += 1;
      else result.skipped[channel] += 1;
    }
  }

  return result;
}

interface DispatchOutcome {
  status: "sent" | "skipped" | "failed";
}

async function dispatch(
  channel: Channel,
  notificationId: number,
  userId: number,
  message: NotificationMessage,
): Promise<DispatchOutcome> {
  try {
    const outcome = await send(channel, userId, message);
    await repo.finishDelivery(notificationId, channel, outcome.status, outcome.error);
    return { status: outcome.status };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("Notification dispatch failed", { channel, notification_id: notificationId, error: detail });
    await repo.finishDelivery(notificationId, channel, "failed", detail);
    return { status: "failed" };
  }
}

async function send(
  channel: Channel,
  userId: number,
  message: NotificationMessage,
): Promise<{ status: "sent" | "skipped"; error: string | null }> {
  if (channel === "in_app") {
    // The notifications row IS the in-app delivery. Nothing to transport.
    return { status: "sent", error: null };
  }

  if (channel === "email") {
    const to = await repo.recipientEmail(userId);
    if (!to) return { status: "skipped", error: "Recipient has no email address" };
    // Reuse the existing mail worker rather than opening a second SMTP path.
    await queueService.publish("emails", {
      to,
      subject: message.title,
      html: `<p>${escapeHtml(message.title)}</p>${message.body ? `<p>${escapeHtml(message.body)}</p>` : ""}`,
      text: message.body ? `${message.title}\n\n${message.body}` : message.title,
    });
    return { status: "sent", error: null };
  }

  // push — fail closed, exactly like Stripe.
  //
  // The device registry is read FIRST, and the notification + delivery rows are
  // already committed by the caller, so a deployment with no FCM credentials still
  // persists everything except the transport and records an honest reason. The
  // provider is the last thing touched, and it is never faked: an unconfigured
  // deployment yields "skipped" with the reason, never "sent".
  const tokens = await repo.pushTokensFor(userId);
  if (tokens.length === 0) return { status: "skipped", error: "No registered devices" };

  if (!isPushAvailable()) {
    return { status: "skipped", error: "Push provider is not configured on this deployment" };
  }

  const result = await getPushClient().send(tokens, { title: message.title, body: message.body });
  // Prune tokens FCM rejected as dead, so the next fan-out is not still trying them.
  for (const dead of result.invalidTokens) await repo.deletePushToken(userId, dead);
  // "sent" only when the provider actually accepted a device.
  return result.sent > 0
    ? { status: "sent", error: null }
    : { status: "skipped", error: "No device accepted the notification" };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
