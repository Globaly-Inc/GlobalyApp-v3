import type { FastifyInstance } from "fastify";
import { AcceptInvitationSchema, InvitationTokenSchema } from "../schemas/onboarding-invitations.schema.js";
import * as service from "../services/onboarding-invitations.service.js";

export async function onboardingInvitationAcceptRoutes(app: FastifyInstance) {
  /** Read-only: the address the sign-in page fills in. Creates nothing, spends nothing. */
  app.post("/lookup", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { token, type } = InvitationTokenSchema.parse(req.body);
    return reply.send(await service.lookupInvitation(token, type));
  });

  /** Mails the sign-in code to the invited address, on the invite row's authority. */
  app.post("/send-code", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { token, type } = InvitationTokenSchema.parse(req.body);
    return reply.send(await service.sendInvitationCode(token, type));
  });

  app.post("/accept", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { token, type, otp } = AcceptInvitationSchema.parse(req.body);
    return reply.send(await service.acceptInvitation(token, type, otp));
  });

  app.post("/request-link", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { token, type } = InvitationTokenSchema.parse(req.body);
    return reply.send(await service.requestNewLink(token, type));
  });
}
