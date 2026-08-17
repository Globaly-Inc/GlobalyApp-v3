import type { FastifyInstance } from "fastify";
import { CreditGrantSchema } from "../schemas/chat.schema.js";
import * as creditService from "../services/credit.service.js";
import { ForbiddenError } from "../../../shared/errors.js";

export async function creditsRoutes(app: FastifyInstance) {
  // GET /credits/balance
  app.get("/credits/balance", async (req, reply) => {
    const balance = await creditService.getBalance(Number(req.auth.sub));
    return reply.send(balance);
  });

  // POST /credits/grant — admin only
  app.post("/credits/grant", async (req, reply) => {
    if (req.auth.type !== "admin") throw new ForbiddenError("Admin access required");
    const input = CreditGrantSchema.parse(req.body ?? {});
    await creditService.grantCredits(input.user_id, input.amount, input.balance_type, input.reason);
    return reply.send({ ok: true });
  });
}
