import type { FastifyInstance } from "fastify";
import { AcceptInvitationSchema } from "../schemas/onboarding-invitations.schema.js";
import * as service from "../services/onboarding-invitations.service.js";

export async function onboardingInvitationAcceptRoutes(app: FastifyInstance) {
  app.post("/accept", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { token, type } = AcceptInvitationSchema.parse(req.body);
    return reply.send(await service.acceptInvitation(token, type));
  });

  app.post("/request-link", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { token, type } = AcceptInvitationSchema.parse(req.body);
    return reply.send(await service.requestNewLink(token, type));
  });
}
