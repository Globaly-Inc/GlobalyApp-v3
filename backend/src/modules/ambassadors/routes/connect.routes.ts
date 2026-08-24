// The ambassador's own view of their Connect payout setup — no business context, just "am I this
// ambassador".

import type { FastifyInstance } from "fastify";
import { AmbassadorIdParamSchema } from "../schemas/ambassadors.schema.js";
import * as service from "../services/connect.service.js";

export async function connectRoutes(app: FastifyInstance) {
  app.get("/me", async (req, reply) => {
    const ambassadors = await service.listMine(Number(req.auth.sub));
    return reply.send(ambassadors);
  });

  app.post("/:ambassadorId/connect/onboard", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { ambassadorId } = AmbassadorIdParamSchema.parse(req.params);
    const result = await service.startOnboarding(ambassadorId, Number(req.auth.sub));
    return reply.send(result);
  });

  app.post("/:ambassadorId/connect/sync", async (req, reply) => {
    const { ambassadorId } = AmbassadorIdParamSchema.parse(req.params);
    const ambassador = await service.syncOnboardingStatus(ambassadorId, Number(req.auth.sub));
    return reply.send(ambassador);
  });
}
