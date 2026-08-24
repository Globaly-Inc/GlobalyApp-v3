// Event names a business can subscribe a webhook to. Nothing dispatches these yet — that's
// cross-cutting work in each source module (enquiries, jobs, events, ...), deliberately out of
// scope here. This module only owns the subscription settings and the dispatch helper.
export const WEBHOOK_EVENTS = ["enquiry.created", "job_application.created", "event_registration.created"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
