import { masterKnex } from "../../../core/db/master-pool.js";
import type { ApplicationStatus } from "../consts.js";

export interface ApplicationRow {
  id: number;
  job_id: number;
  applicant_user_id: number;
  status: ApplicationStatus;
  cover_note: string | null;
  resume_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface HydratedApplicationRow extends ApplicationRow {
  applicant_name: string;
  applicant_email: string;
}

export async function countForJob(jobId: number): Promise<number> {
  const [{ count }] = await masterKnex("job_applications").where({ job_id: jobId }).count<{ count: string }[]>("* as count");
  return Number(count);
}

export async function listForJob(jobId: number): Promise<HydratedApplicationRow[]> {
  return masterKnex<HydratedApplicationRow>("job_applications as ja")
    .join("platform_users as u", "u.id", "ja.applicant_user_id")
    .where("ja.job_id", jobId)
    .select("ja.*", masterKnex.raw("trim(concat(u.first_name, ' ', u.last_name)) as applicant_name"), "u.email as applicant_email")
    .orderBy("ja.created_at", "desc");
}

export async function findByJobAndUser(jobId: number, userId: number): Promise<ApplicationRow | undefined> {
  return masterKnex<ApplicationRow>("job_applications").where({ job_id: jobId, applicant_user_id: userId }).first();
}

export async function insert(data: { job_id: number; applicant_user_id: number; cover_note?: string | null; resume_url?: string | null }): Promise<ApplicationRow> {
  const [row] = await masterKnex<ApplicationRow>("job_applications").insert(data).returning("*");
  return row;
}

export async function updateStatus(id: number, status: ApplicationStatus): Promise<ApplicationRow> {
  const [row] = await masterKnex<ApplicationRow>("job_applications")
    .where({ id })
    .update({ status, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function findById(id: number): Promise<ApplicationRow | undefined> {
  return masterKnex<ApplicationRow>("job_applications").where({ id }).first();
}
