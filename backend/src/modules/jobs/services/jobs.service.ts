// Posting lifecycle: create → publish → close, plus the owner's list/detail.
//
// THE tenant boundary for this module is `requireOwnJob` and the `business_id`
// predicate baked into every repository write. A business id is only ever taken
// from req.business (tenant.plugin → JWT orgId); nothing here accepts one from a
// path, a query or a body.

import { randomBytes } from "node:crypto";
import { NotFoundError, BadRequestError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as repo from "../repositories/jobs.repository.js";
import type { JobRow } from "../repositories/jobs.repository.js";
import type {
  BusinessJobsQueryInput,
  CreateJobInput,
  UpdateJobInput,
} from "../schemas/jobs.schema.js";

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "job"
  );
}

/** Title slug plus a short random suffix — the shape V1 used. Retries on collision. */
async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title);
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${base}-${randomBytes(4).toString("hex")}`;
    if (!(await repo.slugExists(candidate))) return candidate;
  }
  throw new BadRequestError("Could not allocate a unique slug for this title");
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** pg returns numeric/decimal as strings; the wire contract (V2) says number. */
export function toJob(row: JobRow) {
  return {
    ...row,
    pay_min: num(row.pay_min),
    pay_max: num(row.pay_max),
    business_id: num(row.business_id),
    created_by: num(row.created_by),
    location_country_id: num(row.location_country_id),
    views_count: Number(row.views_count ?? 0),
    applications_count: Number(row.applications_count ?? 0),
  };
}

/**
 * Reads a job the calling business owns, or throws 404.
 *
 * 404 and not 403: a 403 would tell business B that job N exists and belongs to
 * someone else. Same reasoning as the enquiries inbox.
 */
export async function requireOwnJob(jobId: number, businessId: number): Promise<JobRow> {
  const job = await repo.findById(jobId);
  if (!job || job.business_id !== businessId) throw new NotFoundError("Job not found");
  return job;
}

/** Maps the validated body onto columns. Undefined keys are left untouched. */
function toColumns(input: UpdateJobInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const copy = <K extends keyof UpdateJobInput>(key: K) => {
    if (input[key] !== undefined) out[key as string] = input[key];
  };
  (
    [
      "title",
      "description",
      "summary",
      "job_type",
      "category",
      "location_city",
      "location_country_id",
      "is_remote",
      "is_hybrid",
      "company_name",
      "pay_min",
      "pay_max",
      "pay_currency",
      "pay_unit",
      "skill_tags",
      "work_rights_required",
      "visa_types_allowed",
      "apply_method",
      "apply_url",
      "is_student_friendly",
      "closing_at",
    ] as const
  ).forEach(copy);
  if (input.screening_questions !== undefined) {
    out.screening_questions = JSON.stringify(input.screening_questions);
  }
  return out;
}

export async function listOwn(businessId: number, query: BusinessJobsQueryInput) {
  const { limit, offset } = paginationToOffset(query);
  const filters = {
    business_id: businessId,
    status: query.status,
    job_type: query.job_type,
    category: query.category,
    q: query.q,
  };
  const [rows, total] = await Promise.all([
    repo.list(filters, limit, offset),
    repo.count(filters),
  ]);
  return buildPaginatedResponse(rows.map(toJob), total, query);
}

export async function getOwn(jobId: number, businessId: number) {
  return { job: toJob(await requireOwnJob(jobId, businessId)) };
}

export async function create(businessId: number, userId: number, input: CreateJobInput) {
  const row = await repo.insert({
    ...toColumns(input),
    business_id: businessId,
    created_by: userId,
    slug: await uniqueSlug(input.title),
    status: "draft",
  });
  return { job: toJob(row) };
}

export async function update(jobId: number, businessId: number, input: UpdateJobInput) {
  await requireOwnJob(jobId, businessId);
  const row = await repo.updateOwned(jobId, businessId, toColumns(input));
  if (!row) throw new NotFoundError("Job not found");
  return { job: toJob(row) };
}

/** Idempotent: republishing an open job does not move published_at. */
export async function publish(jobId: number, businessId: number) {
  const current = await requireOwnJob(jobId, businessId);
  const row = await repo.updateOwned(jobId, businessId, {
    status: "open",
    published_at: current.published_at ?? new Date(),
  });
  if (!row) throw new NotFoundError("Job not found");
  return { job: toJob(row) };
}

export async function close(jobId: number, businessId: number) {
  await requireOwnJob(jobId, businessId);
  // published_at is deliberately left alone — it records when the posting first
  // went live, which closing does not undo.
  const row = await repo.updateOwned(jobId, businessId, { status: "closed" });
  if (!row) throw new NotFoundError("Job not found");
  return { job: toJob(row) };
}

export async function remove(jobId: number, businessId: number): Promise<void> {
  const deleted = await repo.softDeleteOwned(jobId, businessId);
  if (!deleted) throw new NotFoundError("Job not found");
}
