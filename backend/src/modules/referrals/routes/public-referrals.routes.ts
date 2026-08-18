// Public referral routes — the only unauthenticated surface this feature has.
//
// These are public STRUCTURALLY, not by an allow-list: server.ts registers publicReferralsModule as a
// sibling of the encapsulated scope that authPlugin lives in, exactly as it does for
// publicServicesModule and blogModule. The auth hook is therefore never acquired, which cannot be got
// wrong by mistyping a path pattern — and it means a route added to referrals.routes.ts is
// authenticated by construction while one added here is not.

import type { FastifyInstance } from "fastify";
import { REFERRAL_CONFIG } from "../consts.js";
import { LookupParamsSchema, LookupResponseSchema } from "../schemas/referrals.schema.js";
import { resolveUsableCode } from "../services/codes.service.js";
import { mintRefToken } from "../services/attribution.service.js";

/** Byte-identical for "no such code" and "code exists but is unusable" — otherwise it is an oracle. */
const NOT_FOUND_BODY = { error: "We couldn't find that invite link." };

export async function publicReferralsRoutes(app: FastifyInstance) {
  // Reward amounts and windows for every surface. No frontend file hard-codes 20 or 100.
  app.get("/config", async (_req, reply) => {
    return reply.send(REFERRAL_CONFIG);
  });

  app.get(
    "/lookup/:code",
    {
      config: {
        // Per-route cap on top of the global 100/min in server.ts. Enumeration is already impractical
        // against a 31^10 keyspace; this bounds the attempt rate as well.
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const parsed = LookupParamsSchema.safeParse(req.params);
      // A malformed code returns the SAME body as an unknown one — no distinction to probe.
      if (!parsed.success) return reply.status(404).send(NOT_FOUND_BODY);

      const owner = await resolveUsableCode(parsed.data.code);
      if (!owner) return reply.status(404).send(NOT_FOUND_BODY);

      // Shaped through the schema so only the three allow-listed fields can ever be serialised.
      return reply.send(
        LookupResponseSchema.parse({
          referrer_type: owner.owner_type,
          display_name: owner.display_name,
          ref_token: mintRefToken(owner.code_id, owner.owner_type, owner.owner_id),
        }),
      );
    },
  );
}
