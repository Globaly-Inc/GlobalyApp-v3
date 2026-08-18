// Authenticated referral routes.

import type { FastifyInstance } from "fastify";
import { REFERRAL_CONFIG } from "../consts.js";
import * as repo from "../repositories/referrals.repository.js";

export async function referralsRoutes(app: FastifyInstance) {
  /**
   * Code + stats + history in ONE response.
   *
   * V2 needed a second hook (useMyReferralSummary) because two surfaces wanted the code and the
   * rewards together; returning them in one payload avoids repeating that.
   *
   * `code` may be null: INV-10 guarantees at-most-one code and eventual convergence, not immediate
   * existence. The page renders an error state with a support path in that case — it must NEVER
   * create a code as a side effect of being viewed (V2 silently rendered a dash instead).
   *
   * No `link` field: the absolute URL is built by ONE frontend helper from NEXT_PUBLIC_APP_URL.
   * Returning it here too would be a second source of truth for the host, which is the V2 defect.
   */
  app.get("/me", async (req, reply) => {
    const userId = Number(req.auth.sub);

    const [code, stats, referrals] = await Promise.all([
      repo.findCodeByOwner("user", userId),
      repo.referrerStats("user", userId),
      // Phase 1 renders CREDITED rows only, so the "Credited" badge is accurate rather than
      // fabricated (V2 hard-coded it for every row). signed_up/expired rows exist in the table but
      // are deliberately not surfaced until Phase 2 ships the lifecycle model and the countdowns.
      repo.listReferralsByReferrer("user", userId, ["credited"]),
    ]);

    return reply.send({
      code: code?.code ?? null,
      stats,
      referrals: referrals.map((r) => ({
        id: r.id,
        date: r.signed_up_at,
        action_type: r.action_type,
        state: r.state,
        credits_awarded: r.credits_awarded,
      })),
      config: REFERRAL_CONFIG,
    });
  });
}
