import { masterKnex } from "../../../core/db/master-pool.js";
import type { WebhookEvent } from "../consts.js";

export interface WebhookSettingsRow {
  id: number;
  business_id: number;
  url: string;
  secret: string;
  subscribed_events: WebhookEvent[];
  is_active: boolean;
  last_triggered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function findByBusinessId(businessId: number): Promise<WebhookSettingsRow | undefined> {
  return masterKnex<WebhookSettingsRow>("business_webhook_settings").where({ business_id: businessId }).first();
}

export async function upsert(
  businessId: number,
  data: { url: string; secret?: string; subscribed_events: WebhookEvent[]; is_active: boolean },
): Promise<WebhookSettingsRow> {
  const existing = await findByBusinessId(businessId);
  if (existing) {
    const [row] = await masterKnex<WebhookSettingsRow>("business_webhook_settings")
      .where({ id: existing.id })
      .update({
        url: data.url,
        subscribed_events: data.subscribed_events,
        is_active: data.is_active,
        updated_at: masterKnex.fn.now(),
      })
      .returning("*");
    return row;
  }

  const [row] = await masterKnex<WebhookSettingsRow>("business_webhook_settings")
    .insert({
      business_id: businessId,
      url: data.url,
      secret: data.secret,
      subscribed_events: data.subscribed_events,
      is_active: data.is_active,
    })
    .returning("*");
  return row;
}

export async function markTriggered(id: number): Promise<void> {
  await masterKnex("business_webhook_settings").where({ id }).update({ last_triggered_at: masterKnex.fn.now() });
}

/** All active subscribers of a given event — the fan-out list a dispatcher would iterate. */
export async function listActiveSubscribers(event: WebhookEvent): Promise<WebhookSettingsRow[]> {
  return masterKnex<WebhookSettingsRow>("business_webhook_settings")
    .where({ is_active: true })
    .whereRaw("? = ANY(subscribed_events)", [event]);
}
