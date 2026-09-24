// Who an enquiry was distributed to. A business, or — when nobody represented the course —
// the institution it belongs to (see matching.service's commitInstitutionFallback).
//
// The two are separate master tables with separate id spaces, so an id alone is ambiguous and
// every read in this module has to carry the kind with it. `enquiry_distributions` models the
// same thing with two nullable columns and a CHECK that exactly one is set.

import type { FastifyReply, FastifyRequest } from "fastify";
import { requireInstitutionRole, requirePermission } from "../../../core/plugins/auth.plugin.js";
import { ForbiddenError } from "../../../shared/errors.js";

export type RecipientKind = "business" | "institution";

export interface Recipient {
  kind: RecipientKind;
  id: number;
}

/**
 * The org in context, as a recipient. Both ids are resolved by tenant.plugin before any route
 * body runs; which one is populated follows the token's orgType.
 */
export function recipientFromRequest(req: FastifyRequest): Recipient {
  if (req.auth?.orgType === "institution") {
    if (!req.institutionId) throw new ForbiddenError("Switch to an institution context first");
    return { kind: "institution", id: req.institutionId };
  }
  if (!req.businessId) throw new ForbiddenError("Switch to a business context first");
  return { kind: "business", id: req.businessId };
}

/**
 * The `where` clause that scopes a distribution query to this recipient.
 *
 * `alias` is not optional decoration in a joined query: `enquiries` has a `business_id` column
 * of its own (the direct-target one), so an unqualified `business_id` next to it is ambiguous
 * and Postgres rejects it.
 */
export function recipientFilter(recipient: Recipient, alias?: string): Record<string, number> {
  const column = recipient.kind === "institution" ? "institution_id" : "business_id";
  return { [alias ? `${alias}.${column}` : column]: recipient.id };
}

/** The recipient a distribution row belongs to. */
export function recipientOf(row: { business_id: number | null; institution_id: number | null }): Recipient {
  return row.institution_id != null
    ? { kind: "institution", id: Number(row.institution_id) }
    : { kind: "business", id: Number(row.business_id) };
}

export function sameRecipient(a: Recipient, b: Recipient): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/**
 * Permission gate for the enquiry endpoints, which now serve both org kinds.
 *
 * Businesses resolve real permissions through `agents` → `role_id` → permission names.
 * Institutions have no `agents` table and nothing resolves their roles/permissions yet
 * (see requireInstitutionRole's comment), so membership IS the permission there: any active
 * member of the institution can work the leads addressed to it. Tighten this the day
 * institution permissions are actually resolved, not before — a name check pretending to be a
 * permission check is worse than an honest one.
 */
export function requireEnquiryPermission(...permissions: string[]) {
  const institutionGuard = requireInstitutionRole();
  const businessGuard = requirePermission(...permissions);
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth?.orgId) {
      return reply.status(403).send({ error: "Switch to a business or institution context first" });
    }
    return req.auth.orgType === "institution" ? institutionGuard(req, reply) : businessGuard(req, reply);
  };
}
