// AI Counsellor module — conversational study-abroad advisor with streaming responses.
// Default export = authenticated routes (registered behind the auth plugin).
// publicAiCounsellorModule = anonymous routes (guest chat, embed widget) — same
// split pattern as other-services' publicServicesModule.

import type { FastifyInstance } from "fastify";
import { chatRoutes } from "./routes/chat.routes.js";
import { creditsRoutes } from "./routes/credits.routes.js";
import { guestRoutes, guestMigrateRoutes } from "./routes/guest.routes.js";
import { embedRoutes, embedPublicRoutes } from "./routes/embed.routes.js";

export default async function aiChatModule(app: FastifyInstance) {
  app.register(chatRoutes, { prefix: "/api/v3/ai-chat" });
  app.register(creditsRoutes, { prefix: "/api/v3/ai-chat" });
  app.register(guestMigrateRoutes, { prefix: "/api/v3/ai-chat" });
  app.register(embedRoutes, { prefix: "/api/v3/ai-chat" });
}

export async function publicAiCounsellorModule(app: FastifyInstance) {
  app.register(guestRoutes, { prefix: "/api/v3/ai-chat" });
  app.register(embedPublicRoutes, { prefix: "/api/v3/ai-chat" });
}
