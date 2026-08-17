// req.auth.orgId is businesses.schema_name. Billing lives in the master schema and
// is keyed by businesses.id, so every business-context route starts here.
// The id is never taken from the request body — that would be the tenant-isolation
// hole this indirection exists to close.

import type { FastifyRequest } from "fastify";
import { NotFoundError } from "../../../shared/errors.js";
import * as repo from "../repositories/billing.repository.js";
import type { BusinessContext } from "../services/subscriptions.service.js";

export async function currentBusiness(req: FastifyRequest): Promise<BusinessContext> {
  const business = await repo.findBusinessBySchema(req.auth.orgId!);
  if (!business) throw new NotFoundError("Business not found");
  // BusinessRecord.id is declared string in core/types.ts but the column is a
  // serial — Number() is the narrowing, not a cast that could lie.
  return { id: Number(business.id), email: business.email, customer_id: business.customer_id };
}
