import { randomBytes, createHmac } from "node:crypto";
import { createChildLogger } from "../../../shared/logger.js";
import * as repo from "../repositories/webhooks.repository.js";
import type { WebhookEvent } from "../consts.js";
import type { UpsertWebhookInput } from "../schemas/integrations.schema.js";

const logger = createChildLogger("integrations-webhooks");

export async function getSettings(businessId: number) {
  const row = await repo.findByBusinessId(businessId);
  if (!row) return null;
  // The secret is shown once at creation time (the caller already has it); never echo it back.
  return { ...row, secret: undefined };
}

export async function upsertSettings(businessId: number, input: UpsertWebhookInput) {
  const existing = await repo.findByBusinessId(businessId);
  const secret = existing ? undefined : randomBytes(24).toString("hex");
  const row = await repo.upsert(businessId, { ...input, secret });
  // Returned once, on the call that created it — same "show it exactly once" pattern as any API key.
  return { ...row, secret: existing ? undefined : row.secret };
}

/**
 * Fan out an event to every business subscribed to it. Nothing in the codebase calls this yet —
 * wiring each source module (enquiries, jobs, events) to call it on its own event is a separate,
 * later step, not part of this settings-management pass.
 */
export async function dispatch(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  const subscribers = await repo.listActiveSubscribers(event);
  await Promise.all(
    subscribers.map(async (sub) => {
      const body = JSON.stringify({ event, data: payload });
      const signature = createHmac("sha256", sub.secret).update(body).digest("hex");
      try {
        await fetch(sub.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Webhook-Signature": signature },
          body,
        });
        await repo.markTriggered(sub.id);
      } catch (err) {
        logger.warn("Webhook delivery failed", { businessId: sub.business_id, event, err: (err as Error).message });
      }
    }),
  );
}
