// Subscription routes — all business-context. Prefix: /api/v3/subscriptions

import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import {
  FeatureParamsSchema,
  PortalSchema,
  SubscriptionCheckoutSchema,
  VerifySubscriptionSchema,
} from "../schemas/billing.schema.js";
import * as service from "../services/subscriptions.service.js";
import { currentBusiness } from "./context.js";

export async function subscriptionRoutes(app: FastifyInstance) {
  // The pricing page. Authenticated but plan-agnostic.
  app.get("/plans", async (_req, reply) => {
    return reply.send(await service.listPublicPlans());
  });

  app.get("/current", { preHandler: requireBusinessContext }, async (req, reply) => {
    const business = await currentBusiness(req);
    return reply.send(await service.getCurrent(business.id));
  });

  // V1 `create-subscription-checkout`. 503 when Stripe is not configured.
  app.post("/checkout", {
    preHandler: requireBusinessContext,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const input = SubscriptionCheckoutSchema.parse(req.body);
    const business = await currentBusiness(req);
    return reply.status(201).send(await service.startCheckout(business, input));
  });

  // V1 `verify-subscription`.
  app.post("/checkout/verify", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { session_id } = VerifySubscriptionSchema.parse(req.body);
    const business = await currentBusiness(req);
    return reply.send(await service.verifySubscription(business.id, session_id));
  });

  // V1 `subscription-portal`.
  app.post("/portal", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { return_url } = PortalSchema.parse(req.body);
    const business = await currentBusiness(req);
    return reply.send(await service.createPortalLink(business, return_url));
  });

  // V1 `check-subscription-access`. 402 when lapsed, 403 when the plan excludes it.
  app.get("/access/:feature", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { feature } = FeatureParamsSchema.parse(req.params);
    const business = await currentBusiness(req);
    return reply.send(await service.checkAccess(business.id, feature));
  });
}
