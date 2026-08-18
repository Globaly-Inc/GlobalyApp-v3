// Ad serving — the only route in this module with no auth.
//
// Registered at the server root, outside the protected scope, because an ad slot
// on a public page has no JWT. Identity is therefore OPTIONAL: a bearer token, if
// one is present and valid, is used only to hide campaigns that viewer dismissed.
// A missing or invalid token is not an error here, it just means "no dismissals".

import type { FastifyInstance, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../../../config.js";
import { PlacementParamSchema } from "../schemas/ads.schema.js";
import * as service from "../services/ads.service.js";

/**
 * The viewer id, or null. Verified with the same secret as authPlugin — an
 * unverified token is treated as absent, never trusted for its `sub`.
 */
function optionalViewerId(req: FastifyRequest): number | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const claims = jwt.verify(header.slice(7), config.JWT_SECRET) as { sub?: string; type?: string };
    if (claims.type !== "platform_user") return null;
    const id = Number(claims.sub);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export async function publicAdsRoutes(app: FastifyInstance) {
  app.get("/ads/placements/:placement", async (req, reply) => {
    const { placement } = PlacementParamSchema.parse(req.params);
    return reply.send(await service.serve(placement, optionalViewerId(req)));
  });
}
