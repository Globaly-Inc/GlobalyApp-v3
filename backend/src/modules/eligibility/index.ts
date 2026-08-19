// Eligibility checker — V1's `check-eligibility` edge function plus
// StudentEligibility.tsx, rebuilt (§3.5, wave D, [R]).
//
// Registered inside the server's protected scope: both routes need a JWT and the
// owner is always the token's subject. No business context is involved — the table
// is master (§1.2, see globalyapp/20260818_350) and a student's history spans
// tenants.
//
// TWO THINGS FROM V1 ARE DELIBERATELY NOT HERE.
//
// 1. THE 5-CREDIT CHARGE. V1's function called `deduct_credits` against the
//    student's personal wallet for 5 credits BEFORE evaluating, and did not refund
//    it when the evaluation then 404'd. V3 has user wallets, but no fixed-amount
//    user-wallet spend path: billing's spendCredits() is business-wallet only, and
//    ai-counsellor's metering.settleTurn() derives the amount from prompt and
//    completion token counts for an `ai_chat` usage event. Pricing a deterministic,
//    zero-token rule evaluation through either would mean either a third spend
//    ledger or faked token counts. Which of those V3 wants is a billing decision,
//    not an eligibility one, so it is flagged rather than guessed — and until it
//    lands, the feature is free rather than mischarged.
//
// 2. THE 50% PROFILE-COMPLETION GATE. V1's PAGE hid the form below 50%; V1's
//    FUNCTION accepted the request anyway. The API therefore does not enforce it,
//    and returns `profile_completion_percentage` so the banner can be rendered
//    from the same response.

import type { FastifyInstance } from "fastify";

import { eligibilityRoutes } from "./routes/eligibility.routes.js";

export default async function eligibilityModule(app: FastifyInstance) {
  await app.register(eligibilityRoutes, { prefix: "/api/v3/eligibility" });
}
