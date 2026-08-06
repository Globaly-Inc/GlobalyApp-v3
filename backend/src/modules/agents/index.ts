import type { FastifyInstance } from "fastify";
import { agentRoutes } from "./routes/agents.routes.js";
import { agentFileRoutes } from "./routes/files.routes.js";

export default async function agentsModule(app: FastifyInstance) {
  app.register(agentRoutes, { prefix: "/api/v3/agents" });
  app.register(agentFileRoutes, { prefix: "/api/v3/agents" });
}
