import type { FastifyInstance } from "fastify";
import * as repo from "../repositories/notifications.repository.js";

export async function notificationRoutes(app: FastifyInstance) {
  // The only route in this scope. The bell badge is a shell concern on every personal route, which is why
  // it is its own endpoint rather than a field on the Home summary.
  app.get("/unread-count", async (req, reply) => {
    const unread = await repo.unreadCountForUser(Number(req.auth.sub));
    return reply.send({ unread });
  });
}
