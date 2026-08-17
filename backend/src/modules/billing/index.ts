// Billing module — credits, subscriptions, plan/coupon catalogue, Stripe webhook.
//
// Registered at the ROOT of the server (like blogModule), not inside the shared
// protected scope, because the Stripe webhook cannot carry a JWT: it is
// authenticated by signature. Everything else lives in this module's own
// authenticated sub-scope, which registers the same auth + tenant plugins the
// protected scope uses, so guards behave identically.

import type { FastifyInstance } from "fastify";
import { authPlugin } from "../../core/plugins/auth.plugin.js";
import { tenantPlugin } from "../../core/plugins/tenant.plugin.js";
import { creditRoutes } from "./routes/credits.routes.js";
import { subscriptionRoutes } from "./routes/subscriptions.routes.js";
import { adminBillingRoutes } from "./routes/admin-billing.routes.js";
import { webhookRoutes } from "./routes/webhook.routes.js";

export default async function billingModule(app: FastifyInstance) {
  // Signature-authenticated, no JWT.
  await app.register(webhookRoutes, { prefix: "/api/v3/billing" });

  await app.register(async (secured) => {
    await secured.register(authPlugin);
    await secured.register(tenantPlugin);

    await secured.register(creditRoutes, { prefix: "/api/v3/credits" });
    await secured.register(subscriptionRoutes, { prefix: "/api/v3/subscriptions" });
    await secured.register(adminBillingRoutes, { prefix: "/api/v3/admin/billing" });
  });
}
