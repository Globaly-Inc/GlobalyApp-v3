// Knex only. `student_job_applications` is a master table by §1.2 (its FKs cross
// a tenant boundary), so it is reached through masterKnex and scoped in the WHERE.

import { masterKnex } from "../../../core/db/master-pool.js";
import type { ApplicationStage } from "../consts.js";
import { JOBS } from "./jobs.repository.js";

export const APPLICATIONS = "student_job_applications";

export interface ApplicationRow {
  id: number;
  job_id: number;
  user_id: number;
  business_id: number | null;
  resume_url: string | null;
  resume_mime_type: string | null;
  resume_size_bytes: number | null;
  resume_uploaded_by: number | null;
  resume_uploaded_at: Date | null;
  cover_letter: string | null;
  screening_answers: unknown;
  stage: ApplicationStage;
  match_score: unknown;
  stage_changed_at: Date | null;
  stage_changed_by: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

const APPLICANT_COLUMNS = [
  "a.*",
  "u.first_name as applicant_first_name",
  "u.last_name as applicant_last_name",
  "u.email as applicant_email",
];

function baseQuery() {
  return masterKnex(`${APPLICATIONS} as a`)
    .leftJoin("platform_users as u", "u.id", "a.user_id")
    .whereNull("a.deleted_at");
}

export async function listForJob(
  jobId: number,
  businessId: number,
  stage: ApplicationStage | undefined,
  limit: number,
  offset: number,
) {
  const q = baseQuery().where({ "a.job_id": jobId, "a.business_id": businessId });
  if (stage) q.where("a.stage", stage);
  return q.select(APPLICANT_COLUMNS).orderBy("a.created_at", "desc").limit(limit).offset(offset);
}

export async function countForJob(
  jobId: number,
  businessId: number,
  stage: ApplicationStage | undefined,
): Promise<number> {
  const q = baseQuery().where({ "a.job_id": jobId, "a.business_id": businessId });
  if (stage) q.where("a.stage", stage);
  const [row] = await q.count("a.id as count");
  return Number(row?.count ?? 0);
}

/** A student's own applications, with the job card each one points at. */
export async function listForUser(userId: number, limit: number, offset: number) {
  return masterKnex(`${APPLICATIONS} as a`)
    .leftJoin(`${JOBS} as j`, "j.id", "a.job_id")
    .leftJoin("businesses as b", "b.id", "a.business_id")
    .where("a.user_id", userId)
    .whereNull("a.deleted_at")
    .select([
      "a.*",
      "j.title as job_title",
      "j.slug as job_slug",
      "j.status as job_status",
      "j.job_type",
      "b.business_name",
      "b.logo_url",
    ])
    .orderBy("a.created_at", "desc")
    .limit(limit)
    .offset(offset);
}

export async function countForUser(userId: number): Promise<number> {
  const [row] = await masterKnex(APPLICATIONS)
    .where({ user_id: userId })
    .whereNull("deleted_at")
    .count("id as count");
  return Number(row?.count ?? 0);
}

export async function findByJobAndUser(
  jobId: number,
  userId: number,
): Promise<ApplicationRow | undefined> {
  return masterKnex(APPLICATIONS).where({ job_id: jobId, user_id: userId }).first();
}

export async function insert(data: Record<string, unknown>): Promise<ApplicationRow> {
  const [row] = await masterKnex(APPLICATIONS).insert(data).returning("*");
  return row as ApplicationRow;
}

/**
 * Scoped update: business_id is in the WHERE, so business B patching business A's
 * applicant matches zero rows rather than 403-ing (which would confirm it exists).
 */
export async function updateOwned(
  applicationId: number,
  jobId: number,
  businessId: number,
  data: Record<string, unknown>,
): Promise<ApplicationRow | undefined> {
  const [row] = await masterKnex(APPLICATIONS)
    .where({ id: applicationId, job_id: jobId, business_id: businessId })
    .whereNull("deleted_at")
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row as ApplicationRow | undefined;
}

export async function adminStats(): Promise<{ total: number; last_7_days: number }> {
  const [row] = await masterKnex(APPLICATIONS)
    .whereNull("deleted_at")
    .select(
      masterKnex.raw("count(*)::int as total"),
      masterKnex.raw("count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int as last_7_days"),
    );
  return { total: Number(row?.total ?? 0), last_7_days: Number(row?.last_7_days ?? 0) };
}
