import { httpGet, httpPut } from "@/lib/api/http";
import type { UpsertWebhookInput, WebhookEvent, WebhookSettings } from "./types";

export const businessIntegrationsRealApi = {
  getWebhook: (): Promise<WebhookSettings | null> => httpGet("/integrations/webhook"),

  listEvents: (): Promise<WebhookEvent[]> => httpGet("/integrations/webhook/events"),

  saveWebhook: (input: UpsertWebhookInput): Promise<WebhookSettings> => httpPut("/integrations/webhook", input),
};
