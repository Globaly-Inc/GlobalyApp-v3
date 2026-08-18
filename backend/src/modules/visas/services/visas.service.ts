// Public visa / MARA directory service.
//
// Listing reads only — there is no advice, eligibility or matching logic here, the
// same line V2 drew. V1's eligibility scoring (useVisaEligibilityMatch.matchVisas)
// was a pure client-side function over an already-fetched list and stays one, in
// frontend/src/app/(web)/visas/lib/match-visas.ts.

import { NotFoundError } from "../../../shared/errors.js";
import * as repo from "../repositories/visas.repository.js";
import type { MaraListQuery, VisaListQuery } from "../schemas/visas.schema.js";

/** V1's RPCs returned a bare array, not an envelope. Kept. */
export async function searchVisas(query: VisaListQuery) {
  return repo.searchVisas(query);
}

export async function getVisa(countryCode: string, subclass: string) {
  const row = await repo.findVisa(countryCode, subclass);
  if (!row) throw new NotFoundError("Visa not found");
  return row;
}

export async function searchMaraAgents(query: MaraListQuery) {
  return repo.searchMaraAgents(query);
}

export async function getMaraAgent(marn: string) {
  const row = await repo.findMaraAgent(marn);
  if (!row) throw new NotFoundError("Agent not found");
  return row;
}
