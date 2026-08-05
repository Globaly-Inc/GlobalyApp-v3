// Review service — agents, campuses, visas, verification results.

import { NotFoundError } from "../../../../shared/errors.js";
import { logAudit } from "../shared/audit.js";
import * as repo from "../repositories/review.repository.js";
import type { PatchAgentInput, PatchCampusInput } from "../schemas/review.schema.js";

// ── Agents ──

export async function listAgents(jobId: string) {
  return repo.listAgentsByJob(jobId);
}

export async function listMaraAgents(jobId: string) {
  return { mara_agents: await repo.listMaraAgentsByJob(jobId) };
}

export async function patchAgent(id: string, input: PatchAgentInput, adminId: number) {
  const found = await repo.updateAgent(id, input);
  if (!found) throw new NotFoundError("Agent not found");
  await logAudit(adminId, "AGENT_PATCH", { entityType: "extraction_agents", entityId: id });
  return { updated: true };
}

export async function approveAgent(id: string, adminId: number) {
  const found = await repo.updateAgent(id, { source_status: "active" });
  if (!found) throw new NotFoundError("Agent not found");
  await logAudit(adminId, "AGENT_APPROVE", { entityType: "extraction_agents", entityId: id });
  return { updated: true };
}

export async function rejectAgent(id: string, adminId: number) {
  const found = await repo.updateAgent(id, { source_status: "archived" });
  if (!found) throw new NotFoundError("Agent not found");
  await logAudit(adminId, "AGENT_REJECT", { entityType: "extraction_agents", entityId: id });
  return { updated: true };
}

// ── Campuses ──

export async function listCampuses(jobId: string) {
  return { campuses: await repo.listCampusesByJob(jobId) };
}

export async function patchCampus(id: string, input: PatchCampusInput, adminId: number) {
  const found = await repo.updateCampus(id, input);
  if (!found) throw new NotFoundError("Campus not found");
  await logAudit(adminId, "CAMPUS_PATCH", { entityType: "extraction_campuses", entityId: id });
  return { updated: true };
}

// ── Visas ──

export async function listVisas(jobId: string) {
  return { visas: await repo.listVisasByJob(jobId) };
}

// ── Verification results ──

export async function listVerificationResults(jobId: string) {
  return { results: await repo.listVerificationResultsByJob(jobId) };
}
