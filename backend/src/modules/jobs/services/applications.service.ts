// The applicant pipeline: a student applies, the posting business moves them.
//
// Two different identities, two different scopes, and neither is ever taken from
// the request path:
//   • the student is req.auth.sub;
//   • the business is req.business.id, and it is a WHERE clause on every read and
//     write, so business B simply matches no rows on business A's applicants.

import { ConflictError, NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as appRepo from "../repositories/applications.repository.js";
import type { ApplicationRow } from "../repositories/applications.repository.js";
import * as jobRepo from "../repositories/jobs.repository.js";
import { requireOwnJob } from "./jobs.service.js";
import type {
  ApplicationsQueryInput,
  ApplyInput,
  UpdateApplicationInput,
} from "../schemas/jobs.schema.js";
import type { PaginationInput } from "../../../shared/pagination.js";

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function toApplication(row: ApplicationRow) {
  return {
    ...row,
    id: Number(row.id),
    job_id: Number(row.job_id),
    user_id: Number(row.user_id),
    business_id: num(row.business_id),
    resume_uploaded_by: num(row.resume_uploaded_by),
    stage_changed_by: num(row.stage_changed_by),
  };
}

/**
 * Student applies. A job that is not `open` is a 404, not a 403 — a draft posting
 * should not be discoverable by guessing ids.
 */
export async function apply(jobId: number, userId: number, input: ApplyInput) {
  const job = await jobRepo.findById(jobId);
  if (!job || job.status !== "open") throw new NotFoundError("Job not found");

  const existing = await appRepo.findByJobAndUser(jobId, userId);
  // V2: unique (job_id, user_id).
  if (existing) throw new ConflictError("You have already applied to this job");

  const resume = input.resume;
  const row = await appRepo.insert({
    job_id: jobId,
    user_id: userId,
    business_id: job.business_id,
    cover_letter: input.cover_letter ?? null,
    screening_answers: JSON.stringify(input.screening_answers ?? []),
    // All five resume columns move together or not at all — the DB's
    // resume_metadata_consistency CHECK enforces the same rule.
    resume_url: resume?.url ?? null,
    resume_mime_type: resume?.mime_type ?? null,
    resume_size_bytes: resume?.size_bytes ?? null,
    resume_uploaded_by: resume ? userId : null,
    resume_uploaded_at: resume ? new Date() : null,
    stage: "new",
  });

  await jobRepo.bumpApplicationsCount(jobId, 1);
  return { application: toApplication(row) };
}

export async function listMine(userId: number, query: PaginationInput) {
  const { limit, offset } = paginationToOffset(query);
  const [rows, total] = await Promise.all([
    appRepo.listForUser(userId, limit, offset),
    appRepo.countForUser(userId),
  ]);
  return buildPaginatedResponse(rows.map(toApplication), total, query);
}

export async function listForJob(
  jobId: number,
  businessId: number,
  query: ApplicationsQueryInput,
) {
  // Ownership first: an unknown or foreign job is a 404 before any applicant row
  // is touched, so the endpoint leaks nothing about other businesses' pipelines.
  await requireOwnJob(jobId, businessId);
  const { limit, offset } = paginationToOffset(query);
  const [rows, total] = await Promise.all([
    appRepo.listForJob(jobId, businessId, query.stage, limit, offset),
    appRepo.countForJob(jobId, businessId, query.stage),
  ]);
  return buildPaginatedResponse(rows.map(toApplication), total, query);
}

export async function updateStage(
  jobId: number,
  applicationId: number,
  businessId: number,
  actorId: number,
  input: UpdateApplicationInput,
) {
  await requireOwnJob(jobId, businessId);

  const data: Record<string, unknown> = {};
  if (input.stage !== undefined) {
    data.stage = input.stage;
    data.stage_changed_at = new Date();
    data.stage_changed_by = actorId;
  }
  if (input.notes !== undefined) data.notes = input.notes;

  const row = await appRepo.updateOwned(applicationId, jobId, businessId, data);
  if (!row) throw new NotFoundError("Application not found");
  return { application: toApplication(row) };
}
