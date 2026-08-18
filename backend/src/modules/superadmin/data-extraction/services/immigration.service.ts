// Immigration service — visas, MARA agents, promote, and the fail-closed extract.

import { NotFoundError, AppError } from "../../../../shared/errors.js";
import { logAudit } from "../shared/audit.js";
import * as repo from "../repositories/immigration.repository.js";
import type { ExtractMaraInput, ExtractVisasInput } from "../schemas/immigration.schema.js";

export async function listVisas(opts: { status?: string; limit: number }) {
  return { visas: await repo.listVisas(opts) };
}

export async function listMaraAgents(opts: { status?: string; limit: number }) {
  return { mara_agents: await repo.listMaraAgents(opts) };
}

export async function discardVisa(id: string, adminId: number) {
  const found = await repo.updateVisaStatus(id, "discarded");
  if (!found) throw new NotFoundError("Visa not found");
  await logAudit(adminId, "VISA_DISCARD", { entityType: "extraction_visas", entityId: id });
  return { updated: true };
}

export async function discardMara(id: string, adminId: number) {
  const found = await repo.updateMaraStatus(id, "discarded");
  if (!found) throw new NotFoundError("MARA agent not found");
  await logAudit(adminId, "MARA_DISCARD", { entityType: "extraction_mara_agents", entityId: id });
  return { updated: true };
}

export async function promoteVisa(
  id: string,
  orgType: repo.OrgType,
  orgId: number,
  adminId: number,
) {
  const result = await repo.promoteVisa(id, orgType, orgId);
  await logAudit(adminId, "VISA_PROMOTE", {
    entityType: "extraction_visas",
    entityId: id,
    details: { ...result },
  });
  return result;
}

export async function promoteMara(id: string, adminId: number) {
  const result = await repo.promoteMara(id);
  await logAudit(adminId, "MARA_PROMOTE", {
    entityType: "extraction_mara_agents",
    entityId: id,
    details: { ...result },
  });
  return result;
}

// ── I7 + I8: extract launch, fail-closed ────────────────────────────────────
//
// §3.8 keeps these a 503 stub, and the failure has to be a 503 specifically —
// "the extractor is not wired up on this deployment" — not a 400. V1's own launch
// wiring was broken in exactly that way: its dialogs posted one parameter name and
// its functions read another, so every launch 400'd and the 503 case was never
// reachable. V3 inherited the mismatch (the dialogs post `{ urls }`, the schemas
// demanded `{ source_url, country_code }`), so the request contract is rewired
// here to what the caller actually sends.
//
// Order matches billing/services/stripe.client.ts: auth (route registration) →
// validation (the route parses the schema) → 503. Nothing short of the provider
// call is skipped, so wiring the real extractor in later changes one function.

class ExtractorUnavailableError extends AppError {
  constructor(what: string) {
    super(`${what} extraction provider is not configured on this deployment`, 503, "PROVIDER_UNAVAILABLE");
  }
}

export function extractVisas(_input: ExtractVisasInput): never {
  throw new ExtractorUnavailableError("Visa");
}

export function extractMara(_input: ExtractMaraInput): never {
  throw new ExtractorUnavailableError("MARA agent");
}
