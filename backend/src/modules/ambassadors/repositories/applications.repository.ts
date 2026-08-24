import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import type { ApplicationStatus } from "../consts.js";

export interface ApplicationRow {
  id: number;
  program_id: number;
  applicant_user_id: number;
  status: ApplicationStatus;
  note: string | null;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface HydratedApplicationRow extends ApplicationRow {
  applicant_name: string;
  applicant_email: string;
}

export async function listForProgram(programId: number): Promise<HydratedApplicationRow[]> {
  return masterKnex<HydratedApplicationRow>("ambassador_applications as aa")
    .join("platform_users as u", "u.id", "aa.applicant_user_id")
    .where("aa.program_id", programId)
    .select(
      "aa.*",
      masterKnex.raw("trim(concat(u.first_name, ' ', u.last_name)) as applicant_name"),
      "u.email as applicant_email",
    )
    .orderBy("aa.created_at", "desc");
}

export async function findById(id: number): Promise<ApplicationRow | undefined> {
  return masterKnex<ApplicationRow>("ambassador_applications").where({ id }).first();
}

export async function findByIdForUpdate(trx: Knex.Transaction, id: number): Promise<ApplicationRow | undefined> {
  return trx<ApplicationRow>("ambassador_applications").where({ id }).forUpdate().first();
}

export async function insert(data: {
  program_id: number;
  applicant_user_id: number;
  note?: string | null;
}): Promise<ApplicationRow> {
  const [row] = await masterKnex<ApplicationRow>("ambassador_applications").insert(data).returning("*");
  return row;
}

export async function markReviewed(
  trx: Knex.Transaction,
  id: number,
  data: { status: "approved" | "rejected"; reviewedBy: number; note?: string | null },
): Promise<ApplicationRow> {
  const [row] = await trx<ApplicationRow>("ambassador_applications")
    .where({ id })
    .update({
      status: data.status,
      reviewed_by: data.reviewedBy,
      reviewed_at: trx.fn.now(),
      note: data.note ?? undefined,
      updated_at: trx.fn.now(),
    })
    .returning("*");
  return row;
}
