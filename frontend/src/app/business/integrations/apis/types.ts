// Wire types for /api/v3/integrations/*. Matches backend/src/modules/integrations/schemas + services.

export type WebhookEvent = "enquiry.created" | "job_application.created" | "event_registration.created";

export type WebhookSettings = {
  id: number;
  url: string;
  /** Present only on the response to the call that (re)generated it. */
  secret?: string;
  subscribed_events: WebhookEvent[];
  is_active: boolean;
  last_triggered_at: string | null;
};

export type UpsertWebhookInput = {
  url: string;
  subscribed_events: WebhookEvent[];
  is_active: boolean;
};
