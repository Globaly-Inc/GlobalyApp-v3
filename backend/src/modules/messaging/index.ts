// Messaging module — student↔business conversations with an SSE live thread.
// All tables are in master (public): a conversation spans a student and one or more
// businesses, so it cannot belong to a single tenant schema.

import type { FastifyInstance } from "fastify";

import { messagingRoutes } from "./routes/messaging.routes.js";

export default async function messagingModule(app: FastifyInstance) {
  app.register(messagingRoutes, { prefix: "/api/v3/messaging" });
}
