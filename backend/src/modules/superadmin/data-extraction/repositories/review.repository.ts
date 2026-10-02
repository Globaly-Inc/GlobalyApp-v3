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

export async function updateAgent(id: string, data: Record<string, unknown>, adminId: number) {
  const count = await masterKnex(`${S}.extraction_agents`)
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now(), updated_by_platform_user_id: adminId });
  return count > 0;
}

// ── Campuses ──

/** unconverted: leave out campuses already turned into a real branch (the owner's Branches tab). */
export type CampusListFilters = { search?: string; unconverted?: boolean };

function filteredCampusesQuery(jobId: string, { search, unconverted }: CampusListFilters = {}) {
  const q = masterKnex(`${S}.extraction_campuses`).where({ job_id: jobId });
  if (search) q.whereILike("name", `%${search}%`);
  if (unconverted) q.whereNull("converted_branch_id");
  return q;
}

/** Takes a campus for conversion so two runs can never convert it twice. Returns the claim id
 * (null when someone else holds it). A claim older than CLAIM_STALE is reclaimable — its run died
 * before finishing — and a failed campus is never claimed again until convert_failed_at is
 * cleared. Only the current claim's holder can finish it (markCampusConverted / failCampus), so a
 * slow run that was reclaimed can't also record a branch. */
const CLAIM_STALE = "15 minutes";
export async function claimCampus(id: string): Promise<string | null> {
  const [row] = await masterKnex(`${S}.extraction_campuses`).where({ id })
    .whereNull("converted_branch_id").whereNull("convert_failed_at")
    .where((w) => w.whereNull("convert_claimed_at").orWhereRaw(`convert_claimed_at < now() - interval '${CLAIM_STALE}'`))
    .update({ convert_claimed_at: masterKnex.fn.now(), convert_claim_id: masterKnex.raw("gen_random_uuid()") })
    .returning("convert_claim_id");
  return row ? String(row.convert_claim_id) : null;
}

export async function failCampus(id: string, claimId: string) {
  await masterKnex(`${S}.extraction_campuses`).where({ id, convert_claim_id: claimId })
    .update({ convert_claimed_at: null, convert_claim_id: null, convert_failed_at: masterKnex.fn.now() });
}

/** The courses the extraction linked to this campus — what a branch made from it teaches. */
export async function listCourseIdsByCampus(campusId: string): Promise<string[]> {
  const rows = await masterKnex(`${S}.extraction_course_campuses`).where({ campus_id: campusId })
    .whereNotNull("course_id").distinct("course_id");
  return rows.map((r) => String(r.course_id));
}

/** Throws when this run no longer holds the claim — the caller (inside linkOrDiscard) then
 * discards the branch it just made, leaving the reclaiming run's branch as the only one. */
export async function markCampusConverted(id: string, claimId: string, branchId: string) {
  const count = await masterKnex(`${S}.extraction_campuses`).where({ id, convert_claim_id: claimId })
    .update({ converted_branch_id: branchId, convert_claimed_at: null, convert_claim_id: null, updated_at: masterKnex.fn.now() });
  if (count === 0) throw new Error(`Campus ${id} was reclaimed by another run`);
}

/** Jobs with campuses still waiting to become branch orgs (never converted, not failed, no live
 * claim) whose org is active — what an interrupted conversion left behind. Bounded per sweep. */
export async function jobsWithPendingCampuses(limit = 20): Promise<string[]> {
  const activeOrg = (table: string) => (sub: import("knex").Knex.QueryBuilder) =>
    sub.select(1).from(table).whereRaw(`${table}.source_job_id = c.job_id`)
      .whereNull(`${table}.deleted_at`).whereNot(`${table}.account_status`, 0);
  const rows = await masterKnex(`${S}.extraction_campuses as c`)
    .whereNull("c.converted_branch_id").whereNull("c.convert_failed_at")
    .where((w) => w.whereNull("c.convert_claimed_at").orWhereRaw(`c.convert_claimed_at < now() - interval '${CLAIM_STALE}'`))
    .where((w) => w.whereExists(activeOrg("institutions")).orWhereExists(activeOrg("businesses")))
    .distinct("c.job_id").limit(limit);
  return rows.map((r) => String(r.job_id));
}

/** Which of these business_branches ids came from an extracted campus: converted into a branch
 * org (converted_branch_id), or copied in as a plain row at claim time (its uuid IS the campus id). */
export async function convertedBranchIds(branchIds: string[]): Promise<Set<string>> {
  if (branchIds.length === 0) return new Set();
  const rows = await masterKnex(`${S}.extraction_campuses`)
    .where((w) => w.whereIn("converted_branch_id", branchIds).orWhereIn("id", branchIds))
    .select("id", "converted_branch_id");
  const wanted = new Set(branchIds);
  return new Set(rows.flatMap((r) => [String(r.id), String(r.converted_branch_id)]).filter((id) => wanted.has(id)));
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

export async function updateCampus(id: string, data: Record<string, unknown>, adminId: number) {
  const count = await masterKnex(`${S}.extraction_campuses`)
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now(), updated_by_platform_user_id: adminId });
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
