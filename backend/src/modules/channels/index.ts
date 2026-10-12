// Channels module — WhatsApp, Instagram and Facebook Messenger for the Inbox, through Zernio.
// Default export = authenticated Channels page routes (registered behind the auth plugin).
// publicChannelsModule = Zernio's webhook (no auth; verified by signature instead).

import type { FastifyInstance } from "fastify";
import { channelsRoutes } from "./routes/channels.routes.js";
import { zernioWebhookRoutes } from "./routes/webhook.routes.js";

export default async function channelsModule(app: FastifyInstance) {
  app.register(channelsRoutes, { prefix: "/api/v3/channels" });
}

export async function publicChannelsModule(app: FastifyInstance) {
  app.register(zernioWebhookRoutes, { prefix: "/api/v3/channels" });
}
