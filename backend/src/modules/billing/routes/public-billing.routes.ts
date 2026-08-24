// Unauthenticated: plan browsing for a pricing page reached before signup.

import type { FastifyInstance } from "fastify";
import * as subscriptions from "../services/subscriptions.service.js";

export async function publicBillingRoutes(app: FastifyInstance) {
  app.get("/plans", async (_req, reply) => {
    const plans = await subscriptions.listPlans();
    return reply.send(plans);
  });
}
