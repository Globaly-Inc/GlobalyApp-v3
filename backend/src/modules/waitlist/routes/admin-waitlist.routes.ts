// Prefix: /api/v3/admin/waitlist — the only read of the waitlist that exists.
//
// Registered inside the server's protected scope (so a missing token is a 401) and
// gated by requireAdmin (so a signed-in student is a 403). The repository names its
// columns; nothing here widens that.

import type { FastifyInstance } from "fastify";

import { requireAdmin } from "../../../core/plugins/auth.plugin.js";
import * as service from "../services/waitlist.service.js";
import { ListWaitlistQuerySchema } from "../schemas/waitlist.schema.js";

export async function adminWaitlistRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: requireAdmin }, async (req, reply) => {
    const query = ListWaitlistQuerySchema.parse(req.query ?? {});
    return reply.send(await service.list(query));
  });
}
