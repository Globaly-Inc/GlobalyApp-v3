import type { UpsertWebhookInput, WebhookEvent, WebhookSettings } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ALL_EVENTS: WebhookEvent[] = ["enquiry.created", "job_application.created", "event_registration.created"];

let mockSettings: WebhookSettings | null = null;

export const businessIntegrationsMockApi = {
  getWebhook: async (): Promise<WebhookSettings | null> => {
    console.log("[mock] GET /integrations/webhook");
    await delay(150);
    return mockSettings;
  },

  listEvents: async (): Promise<WebhookEvent[]> => {
    console.log("[mock] GET /integrations/webhook/events");
    await delay(80);
    return ALL_EVENTS;
  },

  saveWebhook: async (input: UpsertWebhookInput): Promise<WebhookSettings> => {
    console.log("[mock] PUT /integrations/webhook", input);
    await delay(200);
    const isNew = !mockSettings;
    mockSettings = {
      id: 1,
      url: input.url,
      subscribed_events: input.subscribed_events,
      is_active: input.is_active,
      last_triggered_at: mockSettings?.last_triggered_at ?? null,
      ...(isNew ? { secret: "whsec_mock_" + Math.random().toString(36).slice(2, 12) } : {}),
    };
    return mockSettings;
  },
};
