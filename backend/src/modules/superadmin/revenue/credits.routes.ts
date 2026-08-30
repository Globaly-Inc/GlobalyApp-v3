import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PaginationSchema, paginationToOffset, buildPaginatedResponse } from "../../../shared/pagination.js";
import * as repo from "./credits.repository.js";
import * as creditService from "../../ai-counsellor/services/credit.service.js";

const VALID_REASONS = ["signup_grant", "message", "purchase", "admin_grant", "subscription_grant"] as const;

const ListQuery = PaginationSchema.extend({
  reason: z.enum(VALID_REASONS).optional(),
  search: z.string().optional(),
});

const AdjustBody = z.object({
  user_id: z.number().int().positive(),
  amount: z.number().int().refine((n) => n !== 0, "Amount cannot be zero"),
  balance_type: z.enum(["free", "subscription", "purchased"]).default("free"),
  description: z.string().trim().min(1, "Description is required").max(500),
});

const UserSearchQuery = z.object({ q: z.string().default(""), role: z.enum(["platform", "admin"]).default("platform") });

export async function adminCreditsRoutes(app: FastifyInstance) {
  // GET /credits/ledger — all transactions across the platform
  app.get("/credits/ledger", async (req, reply) => {
    const { reason, search, ...pagination } = ListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      repo.listLedger(limit, offset, reason, search),
      repo.countLedger(reason, search),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // POST /credits/adjust — manual grant or deduction
  app.post("/credits/adjust", async (req, reply) => {
    const { user_id, amount, balance_type, description } = AdjustBody.parse(req.body ?? {});
    // Positive = grant (admin_grant), negative = deduct (also admin_grant, negative amount)
    await creditService.grantCredits(user_id, amount, balance_type, "admin_grant", description);
    return reply.send({ ok: true });
  });

  // GET /credits/users/search — user autocomplete for the modal
  app.get("/credits/users/search", async (req, reply) => {
    const { q, role } = UserSearchQuery.parse(req.query);
    const users = await repo.searchUsers(q, role);
    return reply.send(users);
  });
}
