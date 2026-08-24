// Stripe webhook — unauthenticated by construction (Stripe cannot hold a JWT), authenticated
// instead by the signature check below. Registered outside the protected app scope so it never
// gets the JWT-required onRequest hook.
//
// The content-type parser override is scoped to this plugin's own encapsulation context (Fastify
// isolates addContentTypeParser per registration), so it does not touch JSON parsing anywhere
// else — needed because signature verification hashes the *raw* bytes Stripe sent, not a
// re-serialised copy of the parsed object.

import type { FastifyInstance } from "fastify";
import { config } from "../../../config.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as stripe from "../lib/stripe.js";
import { handleWebhookEvent } from "../services/subscriptions.service.js";

const logger = createChildLogger("billing-webhook");

export async function billingWebhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString("utf8")));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.post("/webhook", async (req, reply) => {
    if (!config.STRIPE_BILLING_WEBHOOK_SECRET) {
      logger.error("Received a billing webhook but STRIPE_BILLING_WEBHOOK_SECRET is not configured");
      return reply.status(503).send({ error: "Webhook not configured" });
    }

    const rawBody = (req as unknown as { rawBody: Buffer }).rawBody;
    const signature = req.headers["stripe-signature"] as string | undefined;
    if (!stripe.verifyWebhookSignature(rawBody, signature, config.STRIPE_BILLING_WEBHOOK_SECRET)) {
      logger.warn("Rejected billing webhook with an invalid signature");
      return reply.status(400).send({ error: "Invalid signature" });
    }

    const event = req.body as stripe.StripeWebhookEvent;
    try {
      await handleWebhookEvent(event);
    } catch (err) {
      // Stripe retries on non-2xx, which is exactly what a transient DB error should get.
      logger.error("Billing webhook handler failed", { eventType: event.type, err: (err as Error).message });
      return reply.status(500).send({ error: "Handler failed" });
    }

    return reply.send({ received: true });
  });
}
