// Knex only. `student_jobs` lives in the master database (20260816_002), so every
// query here goes through masterKnex — there is no tenant-schema copy of a job.
//
// No method takes a business id implicitly: the caller passes it, and the caller
// got it from req.business. That is deliberate — it keeps the isolation predicate
// visible at every call site instead of hidden in a default.

import { masterKnex } from "../../../core/db/master-pool.js";
import type { JobStatus } from "../consts.js";

export const JOBS = "student_jobs";

export interface JobRow {
  id: number;
  business_id: number | null;
  created_by: number | null;
  title: string;
  slug: string | null;
  description: string | null;
  summary: string | null;
  job_type: string | null;
  category: string | null;
  company_name: string | null;
  location_city: string | null;
  location_country_id: number | null;
  is_remote: boolean;
  is_hybrid: boolean;
  pay_min: string | null;
  pay_max: string | null;
  pay_currency: string | null;
  pay_unit: string | null;
  skill_tags: string[];
  work_rights_required: boolean;
  visa_types_allowed: string[];
  apply_method: string;
  apply_url: string | null;
  screening_questions: unknown;
  is_student_friendly: boolean;
  status: JobStatus;
  closing_at: Date | null;
  published_at: Date | null;
  views_count: number;
  applications_count: number;
  is_featured: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  /** Joined employer/country card — present on every read that goes through baseQuery(). */
  business_name?: string | null;
  logo_url?: string | null;
  business_slug?: string | null;
  country_name?: string | null;
}

export interface JobFilters {
  business_id?: number;
  status?: string;
  job_type?: string;
  category?: string;
  q?: string;
}

const CARD_COLUMNS = [
  "j.*",
  "b.business_name",
  "b.logo_url",
  "b.subdomain as business_slug",
  "c.name as country_name",
];

/** Live (not soft-deleted) jobs, with the employer card V2's list endpoints join in. */
export function baseQuery() {
  return masterKnex(`${JOBS} as j`)
    .leftJoin("businesses as b", "b.id", "j.business_id")
    .leftJoin("countries as c", "c.id", "j.location_country_id")
    .whereNull("j.deleted_at");
}

export function applyFilters(q: ReturnType<typeof baseQuery>, filters: JobFilters) {
  if (filters.business_id !== undefined) q.where("j.business_id", filters.business_id);
  if (filters.status) q.where("j.status", filters.status);
  if (filters.job_type) q.where("j.job_type", filters.job_type);
  if (filters.category) q.where("j.category", filters.category);
  if (filters.q) q.whereILike("j.title", `%${filters.q}%`);
  return q;
}

export async function list(filters: JobFilters, limit: number, offset: number) {
  return applyFilters(baseQuery(), filters)
    .select(CARD_COLUMNS)
    .orderBy("j.created_at", "desc")
    .limit(limit)
    .offset(offset);
}

export async function count(filters: JobFilters): Promise<number> {
  const [row] = await applyFilters(baseQuery(), filters).count("j.id as count");
  return Number(row?.count ?? 0);
}

export async function findById(id: number): Promise<JobRow | undefined> {
  return baseQuery().select(CARD_COLUMNS).where("j.id", id).first();
}

export async function slugExists(slug: string): Promise<boolean> {
  const row = await masterKnex(JOBS).where({ slug }).whereNull("deleted_at").first("id");
  return !!row;
}

export async function insert(data: Record<string, unknown>): Promise<JobRow> {
  const [row] = await masterKnex(JOBS).insert(data).returning("*");
  return row as JobRow;
}

/**
 * Scoped update. `businessId` is part of the WHERE, not checked beforehand, so a
 * cross-tenant write cannot slip through a gap between the check and the update.
 * Returns undefined when the job is not this business's — the caller turns that
 * into a 404.
 */
export async function updateOwned(
  id: number,
  businessId: number,
  data: Record<string, unknown>,
): Promise<JobRow | undefined> {
  const [row] = await masterKnex(JOBS)
    .where({ id, business_id: businessId })
    .whereNull("deleted_at")
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row as JobRow | undefined;
}

export async function softDeleteOwned(id: number, businessId: number): Promise<number> {
  return masterKnex(JOBS)
    .where({ id, business_id: businessId })
    .whereNull("deleted_at")
    .update({ deleted_at: masterKnex.fn.now() });
}

export async function bumpApplicationsCount(id: number, delta: number): Promise<void> {
  await masterKnex(JOBS).where({ id }).increment("applications_count", delta);
}

export async function statusCounts(): Promise<Record<string, number>> {
  const rows = await masterKnex(JOBS)
    .whereNull("deleted_at")
    .groupBy("status")
    .select("status")
    .count("id as count");
  return Object.fromEntries(rows.map((r) => [String(r.status), Number(r.count)]));
}
