// Extraction jobs repository — all queries against superadmin.extraction_jobs + related reads.

import { masterKnex } from "../../../../core/db/master-pool.js";

const T = "superadmin.extraction_jobs";
const T_OVERVIEW = "superadmin.extraction_institution_overview";
const T_EVENTS = "superadmin.extraction_job_events";
const T_CAMPUSES = "superadmin.extraction_campuses";
const T_AGENTS = "superadmin.extraction_agents";

export async function listJobs(opts: { status?: string; q?: string; limit: number }) {
  const query = masterKnex(T).select("*").orderBy("created_at", "desc").limit(opts.limit);
  if (opts.status) query.where("status", opts.status);
  if (opts.q) query.where("institution_name", "ilike", `%${opts.q}%`);
  return query;
}

export async function countJobsByStatus() {
  const rows = await masterKnex(T)
    .select("status")
    .count("id as count")
    .groupBy("status");
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
}

export async function listJobsFiltered(opts: {
  statuses?: string[];
  sourceType?: string;
  excludeSourceType?: string;
  limit: number;
}) {
  const query = masterKnex(T).select("*").orderBy("created_at", "desc").limit(opts.limit);
  if (opts.statuses?.length) query.whereIn("status", opts.statuses);
  if (opts.sourceType) query.where("source_type", opts.sourceType);
  if (opts.excludeSourceType) query.whereNot("source_type", opts.excludeSourceType);

  const jobs = await query;

  // Attach campus/agent counts
  if (jobs.length) {
    const jobIds = jobs.map((j: { id: string }) => j.id);

    const [campusCounts, agentCounts] = await Promise.all([
      masterKnex(T_CAMPUSES)
        .select("job_id")
        .count("id as count")
        .whereIn("job_id", jobIds)
        .groupBy("job_id"),
      masterKnex(T_AGENTS)
        .select("job_id")
        .count("id as count")
        .whereIn("job_id", jobIds)
        .groupBy("job_id"),
    ]);

    const campusMap = Object.fromEntries(campusCounts.map((r: any) => [r.job_id, Number(r.count)]));
    const agentMap = Object.fromEntries(agentCounts.map((r: any) => [r.job_id, Number(r.count)]));

    for (const job of jobs as any[]) {
      job.campus_count = campusMap[job.id] ?? 0;
      job.agent_count = agentMap[job.id] ?? 0;
    }
  }

  return jobs;
}

export async function findJobById(id: string) {
  return masterKnex(T).where({ id }).first();
}

export async function findJobWithOverview(id: string) {
  const [job, overview] = await Promise.all([
    masterKnex(T).where({ id }).first(),
    masterKnex(T_OVERVIEW).where({ job_id: id }).first(),
  ]);
  return { job, overview: overview ?? null };
}

export async function insertJob(data: Record<string, unknown>) {
  const [row] = await masterKnex(T).insert(data).returning("id");
  return row;
}

export async function updateJob(id: string, data: Record<string, unknown>) {
  const count = await masterKnex(T)
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now() });
  return count > 0;
}

export async function deleteJob(id: string) {
  const count = await masterKnex(T).where({ id }).delete();
  return count > 0;
}

export async function listJobEvents(jobId: string, limit: number) {
  return masterKnex(T_EVENTS)
    .where({ job_id: jobId })
    .orderBy("created_at", "desc")
    .limit(limit);
}

export async function listAgentRuns(jobId: string) {
  return masterKnex("superadmin.agent_extraction_runs")
    .where({ job_id: jobId })
    .orderBy("started_at", "desc");
}
