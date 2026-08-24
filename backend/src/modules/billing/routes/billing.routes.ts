// Business-context billing routes: plan browsing, subscribe, portal, wallet status.

import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import { SubscribeInputSchema } from "../schemas/billing.schema.js";
import * as subscriptions from "../services/subscriptions.service.js";
import * as wallet from "../services/wallet.service.js";

export async function billingRoutes(app: FastifyInstance) {
  app.get("/subscription", { preHandler: requireBusinessContext }, async (req, reply) => {
    const status = await subscriptions.getStatus(String(req.businessId));
    return reply.send(status);
  });

  app.post("/subscription/checkout", {
    preHandler: requireBusinessContext,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { plan_code } = SubscribeInputSchema.parse(req.body);
    const result = await subscriptions.startSubscriptionCheckout(String(req.businessId), plan_code, req.auth.email ?? null);
    return reply.send(result);
  });

  app.post("/portal", { preHandler: requireBusinessContext }, async (req, reply) => {
    const result = await subscriptions.openBillingPortal(String(req.businessId));
    return reply.send(result);
  });

  app.get("/wallet", { preHandler: requireBusinessContext }, async (req, reply) => {
    const balance = await wallet.getBalance(req.businessId);
    return reply.send({ balance });
  });
}
