// Paid-ticket routes.
//
// checkout + verify sit inside the JWT scope. The webhook does not — Stripe
// carries no bearer token, so it is authenticated by HMAC over the raw body,
// which is why that plugin installs its own buffer content-type parser (exactly
// the arrangement billing/routes/webhook.routes.ts uses).

import type { FastifyInstance } from "fastify";
import * as payments from "../services/payments.service.js";
import { CheckoutSchema, IdParamSchema, VerifyPaymentSchema } from "../schemas/events.schema.js";

export async function eventPaymentRoutes(app: FastifyInstance) {
  app.post("/:id/payment/checkout", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const input = CheckoutSchema.parse(req.body ?? {});
    const origin = req.headers.origin;
    const result = await payments.startCheckout(
      id,
      Number(req.auth.sub),
      input,
      Array.isArray(origin) ? origin[0] : origin,
    );
    return reply.send(result);
  });

  app.post("/payment/verify", async (req, reply) => {
    const { session_id } = VerifyPaymentSchema.parse(req.body ?? {});
    return reply.send(await payments.verifyCheckout(session_id, Number(req.auth.sub)));
  });
}

export async function eventWebhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  app.post("/payment/webhook", {
    config: { rateLimit: { max: 300, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const signature = req.headers["stripe-signature"];
    const result = await payments.handleWebhook(
      req.body as Buffer,
      Array.isArray(signature) ? signature[0] : signature,
    );
    return reply.send(result);
  });
}
