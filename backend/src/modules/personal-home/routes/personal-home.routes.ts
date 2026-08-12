import type { FastifyInstance } from "fastify";
import * as service from "../services/personal-home.service.js";

export async function personalHomeRoutes(app: FastifyInstance) {
  app.get("/summary", async (req, reply) => {
    const summary = await service.getSummary(Number(req.auth.sub));
    return reply.send(summary);
  });
}
