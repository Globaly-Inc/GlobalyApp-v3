// Stripe webhook. Prefix: /api/v3/billing
//
// Deliberately outside the JWT scope: Stripe has no bearer token. The request is
// authenticated by HMAC over the *raw* body instead, which is why this plugin
// installs its own content-type parser — JSON.parse would discard the exact bytes
// the signature covers. The parser is scoped to this plugin, so no other route's
// body handling changes.

import type { FastifyInstance } from "fastify";
import { handleStripeWebhook } from "../services/webhook.service.js";

export async function webhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  app.post("/webhook", {
    config: { rateLimit: { max: 300, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const signature = req.headers["stripe-signature"];
    const result = await handleStripeWebhook(
      req.body as Buffer,
      Array.isArray(signature) ? signature[0] : signature,
    );
    return reply.send(result);
  });
}
