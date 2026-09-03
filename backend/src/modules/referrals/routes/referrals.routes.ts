// Authenticated referral routes.

import type { FastifyInstance } from "fastify";
import * as repo from "../repositories/referrals.repository.js";

// ponytail: static until the credits phase introduces real reward config (env/DB-driven per INV-10).
const REFERRAL_CONFIG = { student_referral_reward: 20, business_referral_reward: 100, w2_days: 14 };

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
      // Phase 1 records sign-ups only; the credited/expired lifecycle arrives with the credits phase.
      repo.listReferralsByReferrer("user", userId, ["signed_up"]),
    ]);

    return reply.send({
      code: code?.code ?? null,
      config: REFERRAL_CONFIG,
      stats,
      referrals: referrals.map((r) => ({
        id: r.id,
        date: r.signed_up_at,
        state: r.state,
      })),
    });
  });
}
