import { createApi } from "@/lib/api/create-api";
import { businessIntegrationsMockApi } from "./mock-data";
import { businessIntegrationsRealApi } from "./real-api";

export const businessIntegrationsApi = createApi({ mock: businessIntegrationsMockApi, real: businessIntegrationsRealApi });
export type { UpsertWebhookInput, WebhookEvent, WebhookSettings } from "./types";
