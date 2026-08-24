import type { WebhookEvent } from "../apis/types";

export const WEBHOOK_EVENT_LABEL: Record<WebhookEvent, string> = {
  "enquiry.created": "New enquiry received",
  "job_application.created": "New job application",
  "event_registration.created": "New event registration",
};
