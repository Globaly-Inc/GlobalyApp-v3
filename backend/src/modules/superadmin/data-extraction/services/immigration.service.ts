// Immigration service — visas, MARA agents, promote functions.

import { NotFoundError, AppError } from "../../../../shared/errors.js";
import { logAudit } from "../shared/audit.js";
import * as repo from "../repositories/immigration.repository.js";

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

export async function promoteVisa(id: string, departmentBusinessId: string, adminId: number) {
  const resultId = await repo.promoteVisa(id, departmentBusinessId);
  await logAudit(adminId, "VISA_PROMOTE", { entityType: "extraction_visas", entityId: id });
  return { id: resultId };
}

export async function promoteMara(id: string, adminId: number) {
  const resultId = await repo.promoteMara(id);
  await logAudit(adminId, "MARA_PROMOTE", { entityType: "extraction_mara_agents", entityId: id });
  return { id: resultId };
}

// I7 + I8: extract stubs — return 503 until pipeline is implemented
export function extractVisasStub() {
  throw new AppError("Extraction provider not configured", 503, "PROVIDER_UNAVAILABLE");
}

export function extractMaraStub() {
  throw new AppError("Extraction provider not configured", 503, "PROVIDER_UNAVAILABLE");
}
