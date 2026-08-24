// Extraction jobs repository — all queries against superadmin.extraction_jobs + related reads.

import { masterKnex } from "../../../../core/db/master-pool.js";

const T = "superadmin.extraction_jobs";
const T_OVERVIEW = "superadmin.extraction_institution_overview";
const T_EVENTS = "superadmin.extraction_job_events";
const T_CAMPUSES = "superadmin.extraction_campuses";
const T_AGENTS = "superadmin.extraction_agents";

// extraction_jobs.institution_name stays null until the pipeline names the job, but the
// extractor writes the name to the overview row well before that — so the list has a
// title to show. Subquery, not a join: job_id has no unique index on the overview table.
const OVERVIEW_NAME = `(select o.name from ${T_OVERVIEW} o where o.job_id = ${T}.id limit 1)`;

export async function listJobs(opts: { status?: string; q?: string; limit: number }) {
  const query = masterKnex(T)
    .select(`${T}.*`)
    .select(masterKnex.raw(`${OVERVIEW_NAME} as overview_name`))
    .orderBy("created_at", "desc")
    .limit(opts.limit);
  if (opts.status) query.where("status", opts.status);
  if (opts.q) query.whereRaw(`coalesce(${T}.institution_name, ${OVERVIEW_NAME}) ilike ?`, [`%${opts.q}%`]);
  return query;
}

// A service job stages its rows in the table named after its service category slug —
// slug "test-preparation" → superadmin.extraction_test_preparation. Whitelisted, so a
// slug can never reach SQL as an unchecked identifier.
const SERVICE_NAME_TABLES = new Set([
  "extraction_accommodation",
  "extraction_banking",
  "extraction_career_services",
  "extraction_insurance",
  "extraction_test_preparation",
  "extraction_translation",
  "extraction_transport",
  "extraction_visa_services",
]);

export function serviceTableForSlug(slug: string | null | undefined): string | null {
  const table = `extraction_${(slug ?? "").replaceAll("-", "_")}`;
  return SERVICE_NAME_TABLES.has(table) ? table : null;
}

/** job id → provider name, for service jobs the institution tables know nothing about. */
export async function findServiceNames(jobs: { id: string; service_category_id?: number | null }[]) {
  const names = new Map<string, string>();
  const withCategory = jobs.filter(
    (j): j is { id: string; service_category_id: number } => Boolean(j.service_category_id),
  );
  if (withCategory.length === 0) return names;

  const categories = await masterKnex("public.service_categories")
    .select("id", "slug")
    .whereIn("id", [...new Set(withCategory.map((j) => j.service_category_id))]);
  const slugById = new Map(categories.map((c) => [c.id, c.slug as string]));

  // One query per involved table, not per job.
  const idsByTable = new Map<string, string[]>();
  for (const job of withCategory) {
    const table = serviceTableForSlug(slugById.get(job.service_category_id));
    if (table) idsByTable.set(table, [...(idsByTable.get(table) ?? []), job.id]);
  }

  await Promise.all(
    [...idsByTable].map(async ([table, ids]) => {
      const rows = await masterKnex(`superadmin.${table}`)
        .select("job_id")
        .select(masterKnex.raw("coalesce(provider_name, name) as name"))
        .whereIn("job_id", ids);
      for (const row of rows) if (row.name && !names.has(row.job_id)) names.set(row.job_id, row.name);
    }),
  );
  return names;
}

export async function countJobsByStatus() {
  const rows = await masterKnex(T)
    .select("status")
    .count("id as count")
    .groupBy("status");
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
}

export type JobSort = "newest" | "oldest" | "name_asc" | "name_desc";

export type JobFilterOpts = {
  statuses?: string[];
  excludeStatuses?: string[];
  sourceType?: string;
  excludeSourceType?: string;
  businessCategoryId?: number;
  q?: string;
};

const RESOLVED_NAME = `coalesce(${T}.institution_name, ${OVERVIEW_NAME})`;

function filteredJobsQuery(opts: JobFilterOpts) {
  const query = masterKnex(T);
  if (opts.statuses?.length) query.whereIn("status", opts.statuses);
  if (opts.excludeStatuses?.length) query.whereNotIn("status", opts.excludeStatuses);
  if (opts.sourceType) query.where("source_type", opts.sourceType);
  if (opts.excludeSourceType) query.whereNot("source_type", opts.excludeSourceType);
  if (opts.businessCategoryId) query.where("business_category_id", opts.businessCategoryId);
  if (opts.q) query.whereRaw(`(${RESOLVED_NAME} ilike ? or ${T}.institution_url ilike ?)`, [`%${opts.q}%`, `%${opts.q}%`]);
  return query;
}

export async function countJobsFiltered(opts: JobFilterOpts) {
  const [row] = await filteredJobsQuery(opts).count("id as count");
  return Number(row.count);
}

export async function listJobsFiltered(opts: JobFilterOpts & { limit: number; offset: number; sort?: JobSort }) {
  const query = filteredJobsQuery(opts)
    .select(`${T}.*`)
    .select(masterKnex.raw(`${OVERVIEW_NAME} as overview_name`))
    .limit(opts.limit)
    .offset(opts.offset);

  switch (opts.sort) {
    case "oldest":
      query.orderBy("created_at", "asc");
      break;
    case "name_asc":
      query.orderByRaw(`${RESOLVED_NAME} asc nulls last`);
      break;
    case "name_desc":
      query.orderByRaw(`${RESOLVED_NAME} desc nulls last`);
      break;
    case "newest":
    default:
      query.orderBy("created_at", "desc");
  }

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
    // Category names come along for the ride — the Context tab shows them, and the job
    // row only carries the ids.
    masterKnex(T)
      .select(`${T}.*`, "bc.name as business_category_name", "sc.name as service_category_name")
      .leftJoin("public.business_categories as bc", "bc.id", `${T}.business_category_id`)
      .leftJoin("public.service_categories as sc", "sc.id", `${T}.service_category_id`)
      .where(`${T}.id`, id)
      .first(),
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
