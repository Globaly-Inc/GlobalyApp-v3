import type { FastifyInstance } from "fastify";
import { agentRoutes } from "./routes/agents.routes.js";

export default async function agentsModule(app: FastifyInstance) {
  app.register(agentRoutes, { prefix: "/api/v3/agents" });
}
