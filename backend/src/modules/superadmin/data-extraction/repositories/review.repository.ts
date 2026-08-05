// Review repository — agents, campuses, visas, verification results reads + patches.

import { masterKnex } from "../../../../core/db/master-pool.js";

const S = "superadmin";

// ── Agents ──

export async function listAgentsByJob(jobId: string) {
  const [agents, agentLocations] = await Promise.all([
    masterKnex(`${S}.extraction_agents`).where({ job_id: jobId }).orderBy("created_at", "asc"),
    masterKnex(`${S}.extraction_agent_locations`).where({ job_id: jobId }).orderBy("created_at", "asc"),
  ]);
  return { agents, agent_locations: agentLocations };
}

export async function listMaraAgentsByJob(jobId: string) {
  return masterKnex(`${S}.extraction_mara_agents`).where({ job_id: jobId }).orderBy("created_at", "asc");
}

export async function updateAgent(id: string, data: Record<string, unknown>) {
  const count = await masterKnex(`${S}.extraction_agents`)
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now() });
  return count > 0;
}

// ── Campuses ──

export async function listCampusesByJob(jobId: string) {
  return masterKnex(`${S}.extraction_campuses`).where({ job_id: jobId }).orderBy("created_at", "asc");
}

export async function updateCampus(id: string, data: Record<string, unknown>) {
  const count = await masterKnex(`${S}.extraction_campuses`)
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now() });
  return count > 0;
}

// ── Visas ──

export async function listVisasByJob(jobId: string) {
  return masterKnex(`${S}.extraction_visas`).where({ job_id: jobId }).orderBy("created_at", "asc");
}

// ── Verification results ──

export async function listVerificationResultsByJob(jobId: string) {
  return masterKnex(`${S}.extraction_verification_results`).where({ job_id: jobId }).orderBy("created_at", "asc");
}
