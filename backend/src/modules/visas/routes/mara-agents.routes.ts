// Public MARA agent directory — V1's search_mara_agents / get_mara_agent_detail
// RPCs, served at the same /migration-agents paths V2 used.

import type { FastifyInstance } from "fastify";

import { MaraListQuerySchema, MarnParamSchema } from "../schemas/visas.schema.js";
import * as service from "../services/visas.service.js";

export async function maraAgentsRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const query = MaraListQuerySchema.parse(req.query);
    return reply.send(await service.searchMaraAgents(query));
  });

  app.get("/:marn", async (req, reply) => {
    const { marn } = MarnParamSchema.parse(req.params);
    return reply.send(await service.getMaraAgent(marn));
  });
}
