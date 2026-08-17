// Platform-operator billing routes. Prefix: /api/v3/admin/billing
// Every route is requireAdmin — these read and write across all businesses.

import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../../core/plugins/auth.plugin.js";
import {
  CouponCreateSchema,
  CouponUpdateSchema,
  IdParamsSchema,
  LedgerQuerySchema,
  PlanCreateSchema,
  PlanUpdateSchema,
  SubscriberQuerySchema,
} from "../schemas/billing.schema.js";
import * as service from "../services/admin.service.js";

export async function adminBillingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);

  // ── Plans ──
  app.get("/plans", async (_req, reply) => reply.send(await service.listPlans()));

  app.post("/plans", async (req, reply) => {
    const input = PlanCreateSchema.parse(req.body);
    return reply.status(201).send(await service.createPlan(input));
  });

  app.patch("/plans/:id", async (req, reply) => {
    const { id } = IdParamsSchema.parse(req.params);
    const input = PlanUpdateSchema.parse(req.body);
    return reply.send(await service.updatePlan(id, input));
  });

  app.delete("/plans/:id", async (req, reply) => {
    const { id } = IdParamsSchema.parse(req.params);
    return reply.send(await service.deletePlan(id));
  });

  // ── Coupons ──
  app.get("/coupons", async (_req, reply) => reply.send(await service.listCoupons()));

  app.post("/coupons", async (req, reply) => {
    const input = CouponCreateSchema.parse(req.body);
    return reply.status(201).send(await service.createCoupon(input));
  });

  app.patch("/coupons/:id", async (req, reply) => {
    const { id } = IdParamsSchema.parse(req.params);
    const input = CouponUpdateSchema.parse(req.body);
    return reply.send(await service.updateCoupon(id, input));
  });

  app.delete("/coupons/:id", async (req, reply) => {
    const { id } = IdParamsSchema.parse(req.params);
    return reply.send(await service.deleteCoupon(id));
  });

  // ── Reports ──
  app.get("/subscribers", async (req, reply) => {
    const query = SubscriberQuerySchema.parse(req.query);
    return reply.send(
      await service.listSubscribers({ status: query.status, planId: query.plan_id }, query),
    );
  });

  app.get("/transactions", async (req, reply) => {
    const query = LedgerQuerySchema.parse(req.query);
    return reply.send(
      await service.listLedger(
        { businessId: query.business_id, transactionType: query.transaction_type },
        query,
      ),
    );
  });
}
