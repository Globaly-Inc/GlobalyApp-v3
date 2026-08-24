// Billing module — subscription plans, Stripe subscription checkout, billing portal, the
// business credit wallet, and the webhook that keeps them in sync with Stripe.

import type { FastifyInstance } from "fastify";
import { billingRoutes } from "./routes/billing.routes.js";
import { publicBillingRoutes } from "./routes/public-billing.routes.js";
import { billingWebhookRoutes } from "./routes/webhook.routes.js";

export default async function billingModule(app: FastifyInstance) {
  app.register(billingRoutes, { prefix: "/api/v3/billing" });
}

/** Unauthenticated: plan browsing + the Stripe webhook. Registered outside the protected scope. */
export async function publicBillingModule(app: FastifyInstance) {
  app.register(publicBillingRoutes, { prefix: "/api/v3/billing" });
  app.register(billingWebhookRoutes, { prefix: "/api/v3/billing" });
}
