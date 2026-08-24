import { masterKnex } from "../../../core/db/master-pool.js";
import type { JobType } from "../consts.js";

export interface JobRow {
  id: number;
  business_id: number | null;
  title: string;
  company_name: string | null;
  description: string | null;
  job_type: JobType | null;
  location_city: string | null;
  location_country_id: number | null;
  is_remote: boolean;
  pay_min: string | null;
  pay_max: string | null;
  pay_currency: string | null;
  pay_unit: "hour" | "year" | null;
  is_published: boolean;
  closing_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function listForBusiness(businessId: number): Promise<JobRow[]> {
  return masterKnex<JobRow>("student_jobs").where({ business_id: businessId }).whereNull("deleted_at").orderBy("created_at", "desc");
}

export async function findForBusiness(id: number, businessId: number): Promise<JobRow | undefined> {
  return masterKnex<JobRow>("student_jobs").where({ id, business_id: businessId }).whereNull("deleted_at").first();
}

export async function findPublished(id: number): Promise<JobRow | undefined> {
  return masterKnex<JobRow>("student_jobs").where({ id, is_published: true }).whereNull("deleted_at").first();
}

export async function insert(data: Record<string, unknown>): Promise<JobRow> {
  const [row] = await masterKnex<JobRow>("student_jobs").insert(data).returning("*");
  return row;
}

export async function update(id: number, data: Record<string, unknown>): Promise<JobRow> {
  const [row] = await masterKnex<JobRow>("student_jobs").where({ id }).update({ ...data, updated_at: masterKnex.fn.now() }).returning("*");
  return row;
}

export async function softDelete(id: number): Promise<void> {
  await masterKnex("student_jobs").where({ id }).update({ deleted_at: masterKnex.fn.now() });
}
