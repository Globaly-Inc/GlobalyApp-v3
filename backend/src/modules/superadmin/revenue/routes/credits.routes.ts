// Admin → Revenue → Credit ledger.
//
// Read-only in this phase: the ledger is append-only, and manual adjustments plus referral voids are
// Phase 3. Referral rewards appear here automatically because they are ordinary credit_transactions
// rows — the ledger is the single place credits are recorded, whoever wrote them.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { paginationToOffset, buildPaginatedResponse, PaginationSchema } from "../../../../shared/pagination.js";
import { countAllTransactions, listAllTransactions } from "../../../credits/credits.repository.js";

const ListQuery = PaginationSchema.extend({
  // Lets an operator isolate referral credits from AI spend, purchases and manual adjustments.
  // Mirrors credit_tx_kind_check — a kind the table accepts but this enum rejects would be a row the
  // ledger holds and no operator can filter to.
  kind: z.enum([
    "referral_reward", "referral_reversal", "purchase", "manual_adjustment",
    "ai_message", "signup_grant", "subscription_grant", "admin_grant",
  ]).optional(),
});

export async function adminCreditRoutes(app: FastifyInstance) {
  app.get("/credits", async (req, reply) => {
    const { kind, ...pagination } = ListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);

    const [rows, total] = await Promise.all([
      listAllTransactions({ limit, offset, kind }),
      countAllTransactions(kind),
    ]);

    return reply.send(
      buildPaginatedResponse(
        rows.map((r) => ({
          id: r.id,
          created_at: r.created_at,
          owner_type: r.owner_type,
          owner_id: r.owner_id,
          // null when the account was deleted — the UI falls back to #id rather than dropping the row.
          owner_name: r.owner_name,
          kind: r.kind,
          amount: r.amount,
          balance_after: r.balance_after,
          description: r.description,
          reference_type: r.reference_type,
          reference_id: r.reference_id,
        })),
        total,
        pagination,
      ),
    );
  });
}
