// Extraction visa services repository — flat table, no child/junction tables.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
const T = `${S}.extraction_visa_services`;

export async function listVisaServicesByJob(jobId: string, status?: string) {
  const q = masterKnex(T).where({ job_id: jobId }).orderBy("created_at", "asc");
  if (status) q.where("status", status);
  return q;
}

export async function countVisaServicesByJob(jobId: string) {
  const [row] = await masterKnex(T).where({ job_id: jobId }).count("id as count");
  return Number(row.count);
}

// Powers a status filter dropdown, same pattern as courses.repository's countCoursesByStatus.
export async function countVisaServicesByStatus(jobId: string) {
  const rows = await masterKnex(T)
    .where({ job_id: jobId })
    .select("status")
    .count("id as count")
    .groupBy("status");
  return rows.map((r) => ({ status: (r.status as string | null) ?? "pending", count: Number(r.count) }));
}

export async function updateVisaService(id: string, data: Record<string, unknown>) {
  const count = await masterKnex(T)
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now() });
  return count > 0;
}

export async function deleteVisaService(id: string) {
  const count = await masterKnex(T).where({ id }).delete();
  return count > 0;
}
