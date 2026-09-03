// Public institution-member invite accept route — token-based, no auth. Listed in
// core/plugins/auth.plugin.ts publicPaths. The institution twin of agents' POST /invite/accept.

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import * as service from "../services/institution-members.service.js";

const AcceptInviteSchema = z.object({ token: z.string().min(1) });

export async function institutionMemberInviteRoutes(app: FastifyInstance) {
  app.post("/members/invite/accept", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const body = req.body as Record<string, string>;
    const { token } = AcceptInviteSchema.parse(body);
    const orgId = body.org_id;
    const result = await service.acceptMemberInvitation(orgId, token);
    return reply.send(result);
  });
}
