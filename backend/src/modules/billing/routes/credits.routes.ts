// Credit routes — all business-context. Prefix: /api/v3/credits

import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import { PaginationSchema } from "../../../shared/pagination.js";
import {
  PurchaseCreditsSchema,
  SpendCreditsSchema,
  VerifyPurchaseSchema,
} from "../schemas/billing.schema.js";
import * as service from "../services/credits.service.js";
import { currentBusiness } from "./context.js";

export async function creditRoutes(app: FastifyInstance) {
  app.get("/balance", { preHandler: requireBusinessContext }, async (req, reply) => {
    const business = await currentBusiness(req);
    return reply.send(await service.getBalance(business.id));
  });

  app.get("/transactions", { preHandler: requireBusinessContext }, async (req, reply) => {
    const pagination = PaginationSchema.parse(req.query);
    const business = await currentBusiness(req);
    return reply.send(await service.listTransactions(business.id, pagination));
  });

  // Debit. 402 INSUFFICIENT_CREDITS when the wallet cannot cover it — never a
  // negative balance, no matter how many of these land at once.
  app.post("/spend", { preHandler: requireBusinessContext }, async (req, reply) => {
    const input = SpendCreditsSchema.parse(req.body);
    const business = await currentBusiness(req);
    const result = await service.spendCredits(business.id, input, Number(req.auth.sub));
    return reply.send(result);
  });

  // V1 `purchase-credits`. 503 when Stripe is not configured.
  app.post("/purchase", {
    preHandler: requireBusinessContext,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const input = PurchaseCreditsSchema.parse(req.body);
    const business = await currentBusiness(req);
    const result = await service.startCreditPurchase(business, input, Number(req.auth.sub));
    return reply.status(201).send(result);
  });

  // V1 `verify-credit-purchase`. Safe to poll — settlement is idempotent.
  app.post("/purchase/verify", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { session_id } = VerifyPurchaseSchema.parse(req.body);
    const business = await currentBusiness(req);
    return reply.send(await service.verifyCreditPurchase(business.id, session_id, Number(req.auth.sub)));
  });
}
