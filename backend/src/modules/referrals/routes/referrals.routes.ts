// Authenticated referral routes.

import type { FastifyInstance } from "fastify";
import { REFERRAL_CONFIG, REWARD_BY_ACTION } from "../consts.js";
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
      // Terminal rows only, so a rendered status is always accurate (V2 hard-coded "Credited" on every
      // row). signed_up/expired rows exist in the table but are deliberately not surfaced until Phase 2
      // ships the pending lifecycle and its countdowns.
      repo.listReferralsByReferrer("user", userId, repo.TERMINAL_EARNED_STATES),
    ]);

    return reply.send({
      code: code?.code ?? null,
      stats,
      referrals: referrals.map((r) => ({
        id: r.id,
        date: r.signed_up_at,
        action_type: r.action_type,
        state: r.state,
        // The reward this referral earned, resolved from its action type. Not yet paid — credits are a
        // separate feature — so it is deliberately described as pending rather than awarded.
        reward_credits: r.action_type ? REWARD_BY_ACTION[r.action_type] : null,
      })),
      config: REFERRAL_CONFIG,
    });
  });
}
