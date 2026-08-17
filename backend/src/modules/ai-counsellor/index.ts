// AI Counsellor module — conversational study-abroad advisor with streaming responses.

import type { FastifyInstance } from "fastify";
import { chatRoutes } from "./routes/chat.routes.js";

export default async function aiChatModule(app: FastifyInstance) {
  app.register(chatRoutes, { prefix: "/api/v3/ai-chat" });
}
