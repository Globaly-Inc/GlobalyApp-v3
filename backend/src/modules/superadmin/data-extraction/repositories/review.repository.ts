// Review repository — agents, campuses, visas, verification results reads + patches.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

// ── Agents ──

// `search` param: not a V2 port, explicitly requested for the institution admin Partners tab
// (2026-08-26) so its merged manual+scraped list can search server-side like every other tab.
export async function listAgentsByJob(jobId: string, search?: string) {
  const agentsQuery = masterKnex(`${S}.extraction_agents`).where({ job_id: jobId }).orderBy("created_at", "asc");
  if (search) agentsQuery.whereILike("name", `%${search}%`);
  const [agents, agentLocations] = await Promise.all([
    agentsQuery,
    masterKnex(`${S}.extraction_agent_locations`).where({ job_id: jobId }).orderBy("created_at", "asc"),
  ]);
  return { agents, agent_locations: agentLocations };
}

export type AgentListFilters = { search?: string };

// Matches agents-tab.tsx's pre-existing client-side search scope (name/country/email/city)
// so moving it server-side doesn't narrow what admins could already search by.
function filteredAgentsQuery(jobId: string, { search }: AgentListFilters = {}) {
  const q = masterKnex(`${S}.extraction_agents`).where({ job_id: jobId });
  if (search) {
    q.where((b) => b
      .whereILike("name", `%${search}%`)
      .orWhereILike("country", `%${search}%`)
      .orWhereILike("email", `%${search}%`)
      .orWhereILike("city", `%${search}%`));
  }
  return q;
}

export async function listAgentsByJobPaged(jobId: string, limit: number, offset: number, filters: AgentListFilters = {}) {
  return filteredAgentsQuery(jobId, filters).orderBy("created_at", "asc").limit(limit).offset(offset);
}

export async function countAgentsByJob(jobId: string, filters: AgentListFilters = {}) {
  const [row] = await filteredAgentsQuery(jobId, filters).count("id as count");
  return Number(row.count);
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

export type CampusListFilters = { search?: string };

function filteredCampusesQuery(jobId: string, { search }: CampusListFilters = {}) {
  const q = masterKnex(`${S}.extraction_campuses`).where({ job_id: jobId });
  if (search) q.whereILike("name", `%${search}%`);
  return q;
}

export async function listCampusesByJob(jobId: string) {
  return masterKnex(`${S}.extraction_campuses`).where({ job_id: jobId }).orderBy("created_at", "asc");
}

export async function listCampusesByJobPaged(jobId: string, limit: number, offset: number, filters: CampusListFilters = {}) {
  return filteredCampusesQuery(jobId, filters).orderBy("created_at", "asc").limit(limit).offset(offset);
}

export async function countCampusesByJob(jobId: string, filters: CampusListFilters = {}) {
  const [row] = await filteredCampusesQuery(jobId, filters).count("id as count");
  return Number(row.count);
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
