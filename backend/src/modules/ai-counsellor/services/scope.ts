// Which wallet a chat spends from, and which sessions it can see.
//
// The scope comes from the JWT alone: a token carrying `orgId` is a business
// context (tenantPlugin has already resolved and validated the business onto
// req.business), anything else is personal. It is never read from the body, which
// is the isolation hole this indirection exists to close — the same rule
// billing/routes/context.ts follows.

import type { FastifyRequest } from "fastify";
import { ForbiddenError } from "../../../shared/errors.js";

export type ChatScope =
  | { ownerType: "user"; userId: number; businessId: null }
  | { ownerType: "business"; userId: number; businessId: number };

export function resolveScope(req: FastifyRequest): ChatScope {
  const userId = Number(req.auth.sub);
  if (!req.auth.orgId) return { ownerType: "user", userId, businessId: null };

  // tenantPlugin 404s an unknown or inactive schema before the handler runs, so a
  // present orgId with no req.business can only mean the plugin is not registered.
  if (!req.business) throw new ForbiddenError("Business context could not be resolved");
  return { ownerType: "business", userId, businessId: Number(req.business.id) };
}

/** A session belongs to a scope only when both discriminators agree. */
export function ownsSession(
  scope: ChatScope,
  session: { owner_type: string; platform_user_id: number; business_id: number | null },
): boolean {
  if (scope.ownerType === "business") {
    return session.owner_type === "business" && session.business_id === scope.businessId;
  }
  return (
    session.owner_type === "user" &&
    session.business_id === null &&
    session.platform_user_id === scope.userId
  );
}
