import { masterKnex } from "../../../core/db/master-pool.js";
import type { CommissionType, ProgramStatus } from "../consts.js";

export interface ProgramRow {
  id: number;
  business_id: number;
  name: string;
  description: string | null;
  commission_type: CommissionType;
  commission_value: string;
  currency: string;
  status: ProgramStatus;
  created_at: Date;
  updated_at: Date;
}

export async function listForBusiness(businessId: number): Promise<ProgramRow[]> {
  return masterKnex<ProgramRow>("ambassador_programs")
    .where({ business_id: businessId })
    .whereNull("deleted_at")
    .orderBy("created_at", "desc");
}

export async function findById(id: number): Promise<ProgramRow | undefined> {
  return masterKnex<ProgramRow>("ambassador_programs").where({ id }).whereNull("deleted_at").first();
}

export async function findForBusiness(id: number, businessId: number): Promise<ProgramRow | undefined> {
  return masterKnex<ProgramRow>("ambassador_programs")
    .where({ id, business_id: businessId })
    .whereNull("deleted_at")
    .first();
}

export async function insert(data: {
  business_id: number;
  name: string;
  description?: string | null;
  commission_type: CommissionType;
  commission_value: number;
  currency: string;
}): Promise<ProgramRow> {
  // commission_value is numeric in Postgres — the driver returns it as a string (ProgramRow reflects
  // that), but insert legitimately takes a number, so the row type doesn't fit the insert payload.
  const [row] = await masterKnex("ambassador_programs").insert(data).returning("*");
  return row as ProgramRow;
}

export async function update(id: number, data: Record<string, unknown>): Promise<ProgramRow> {
  const [row] = await masterKnex<ProgramRow>("ambassador_programs")
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}
