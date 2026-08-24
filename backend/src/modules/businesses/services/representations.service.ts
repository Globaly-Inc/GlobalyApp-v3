// Agent ↔ institution representation requests. An agent invites an institution to represent it
// (or vice versa); only the institution side of a pending request may accept/decline.

import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import * as repo from "../repositories/representations.repository.js";
import type { RepresentationInviteInput } from "../schemas/representations.schema.js";

type Row = Awaited<ReturnType<typeof repo.listForBusiness>>[number];

/** Reshapes a joined row into the caller's perspective: `partner` is whichever side isn't them. */
function toViewerShape(businessId: number, row: Row) {
  const isAgent = row.agent_id === businessId;
  return {
    id: row.id,
    status: row.status,
    regions: row.regions ?? [],
    notes: row.notes,
    created_at: row.created_at,
    responded_at: row.responded_at,
    is_initiator: row.initiated_by != null,
    my_role: isAgent ? "agent" : "institution",
    can_respond: row.status === "pending" && !isAgent,
    partner: {
      id: isAgent ? row.institution_business_id : row.agent_business_id,
      business_name: isAgent ? row.institution_name : row.agent_name,
      logo_url: isAgent ? row.institution_logo_url : row.agent_logo_url,
      city: isAgent ? row.institution_city : row.agent_city,
    },
  };
}

export async function listForBusiness(businessId: number) {
  const rows = await repo.listForBusiness(businessId);
  return rows.map((r) => toViewerShape(businessId, r));
}

export async function searchTargets(businessId: number, businessType: string | null, search: string | undefined, limit: number) {
  const targetType = businessType === "agent" ? "institution" : "agent";
  const excludeIds = [businessId, ...(await repo.listPartnerBusinessIds(businessId))];
  return repo.searchTargets(targetType, excludeIds, search, limit);
}

export async function createInvite(
  businessId: number,
  businessType: string | null,
  initiatedBy: number,
  input: RepresentationInviteInput,
) {
  if (businessType !== "agent" && businessType !== "institution") {
    throw new BadRequestError("Only agent or institution businesses can send representation requests");
  }
  if (input.target_business_id === businessId) throw new BadRequestError("Cannot invite your own business");

  const agent_id = businessType === "agent" ? businessId : input.target_business_id;
  const institution_id = businessType === "institution" ? businessId : input.target_business_id;

  const created = await repo.create({
    agent_id,
    institution_id,
    initiated_by: initiatedBy,
    regions: input.regions?.length ? input.regions : null,
    notes: input.notes ?? null,
  });
  if (!created) throw new BadRequestError("Couldn't create representation request");
  return toViewerShape(businessId, created);
}

export async function respond(businessId: number, businessType: string | null, uuid: string, status: "active" | "rejected", respondedBy: number) {
  if (businessType !== "institution") throw new ForbiddenError("Only the institution side can respond to a representation request");
  const updated = await repo.updateStatus(businessId, uuid, respondedBy, status);
  if (!updated) throw new NotFoundError("Representation request not found or already responded to");
  return toViewerShape(businessId, updated);
}
