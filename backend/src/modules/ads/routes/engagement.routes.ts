// Impression / lead / dismissal / report recording. Signed-in callers only.
//
// V1 added the Bearer check to `record-ad-impression` with the comment "Require
// authentication to prevent budget-drain abuse via fake impressions". That is the
// whole reason these four are inside the protected scope while serving is not: an
// anonymous POST here spends the advertiser's money.
//
// The viewer is ALWAYS taken from the verified JWT (req.auth.sub). `viewer_fingerprint`
// is stored but never trusted as identity.

import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../../shared/errors.js";
import {
  DismissalSchema,
  ImpressionSchema,
  LeadSchema,
  ReportSchema,
} from "../schemas/ads.schema.js";
import * as service from "../services/ads.service.js";

/**
 * Ads are recorded against a platform user. An admin token has no ad viewer, and a
 * business-context token is still the same person — the orgId is irrelevant here.
 */
function viewerId(req: FastifyRequest): number {
  if (req.auth?.type !== "platform_user") {
    throw new ForbiddenError("Only a signed-in platform user can record ad engagement");
  }
  return Number(req.auth.sub);
}

export async function adEngagementRoutes(app: FastifyInstance) {
  app.post("/impressions", async (req, reply) => {
    const input = ImpressionSchema.parse(req.body);
    return reply.send(await service.recordImpression(viewerId(req), input));
  });

  app.post("/leads", async (req, reply) => {
    const input = LeadSchema.parse(req.body);
    return reply.send(await service.recordLead(viewerId(req), input));
  });

  app.post("/dismissals", async (req, reply) => {
    const { campaign_id } = DismissalSchema.parse(req.body);
    return reply.send(await service.dismiss(viewerId(req), campaign_id));
  });

  app.post("/reports", async (req, reply) => {
    const input = ReportSchema.parse(req.body);
    const result = await service.report(viewerId(req), input);
    // 201 for a new report, 200 when this reporter already had one open — the
    // caller can tell "filed" from "already filed" without a second round trip.
    return reply.status(result.created ? 201 : 200).send(result);
  });
}
