// Invitee-facing membership routes: pending business invites and position confirmations.
// Mounted under /api/v3/platform-users — memberships are a platform-user concern, not a Home concern.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as service from "../services/memberships.service.js";

const InviteIdParam = z.object({ id: z.string().uuid() });
const MembershipIdParam = z.object({ membershipId: z.coerce.number().int().positive() });
const RespondBody = z.object({ action: z.enum(["accept", "decline"]) });

export async function membershipRoutes(app: FastifyInstance) {
  app.get("/me/business-invites", async (req, reply) => {
    const invites = await service.listPendingInvites(Number(req.auth.sub));
    return reply.send({ invites });
  });

  app.post("/me/business-invites/:id/respond", async (req, reply) => {
    const { id } = InviteIdParam.parse(req.params);
    const { action } = RespondBody.parse(req.body);
    const result = await service.respondToInvite(Number(req.auth.sub), id, action);
    // 204 either way — an already-actioned invite must disappear from the UI without an error.
    if (result.already) return reply.status(204).send();
    return reply.status(204).send();
  });

  app.get("/me/position-updates", async (req, reply) => {
    const positions = await service.listPositionUpdates(Number(req.auth.sub));
    return reply.send({ positions });
  });

  app.post("/me/position-updates/:membershipId/confirm", async (req, reply) => {
    const { membershipId } = MembershipIdParam.parse(req.params);
    await service.confirmPosition(Number(req.auth.sub), membershipId);
    return reply.status(204).send();
  });
}
