import { masterKnex } from "../../../core/db/master-pool.js";
import type { EventStatus } from "../consts.js";

export interface EventRow {
  id: number;
  business_id: number;
  title: string;
  description: string | null;
  start_at: Date;
  end_at: Date | null;
  is_online: boolean;
  location: string | null;
  meeting_url: string | null;
  capacity: number | null;
  status: EventStatus;
  created_at: Date;
  updated_at: Date;
}

export async function listForBusiness(businessId: number): Promise<EventRow[]> {
  return masterKnex<EventRow>("events").where({ business_id: businessId }).whereNull("deleted_at").orderBy("start_at", "desc");
}

export async function listPublished(limit: number, offset: number): Promise<{ rows: EventRow[]; total: number }> {
  const base = masterKnex<EventRow>("events").where({ status: "published" }).whereNull("deleted_at").where("start_at", ">=", new Date());
  const [rows, [{ count }]] = await Promise.all([
    base.clone().orderBy("start_at", "asc").limit(limit).offset(offset),
    base.clone().count<{ count: string }[]>("* as count"),
  ]);
  return { rows, total: Number(count) };
}

export async function findById(id: number): Promise<EventRow | undefined> {
  return masterKnex<EventRow>("events").where({ id }).whereNull("deleted_at").first();
}

export async function findForBusiness(id: number, businessId: number): Promise<EventRow | undefined> {
  return masterKnex<EventRow>("events").where({ id, business_id: businessId }).whereNull("deleted_at").first();
}

export async function insert(data: Record<string, unknown>): Promise<EventRow> {
  const [row] = await masterKnex<EventRow>("events").insert(data).returning("*");
  return row;
}

export async function update(id: number, data: Record<string, unknown>): Promise<EventRow> {
  const [row] = await masterKnex<EventRow>("events").where({ id }).update({ ...data, updated_at: masterKnex.fn.now() }).returning("*");
  return row;
}

export async function softDelete(id: number): Promise<void> {
  await masterKnex("events").where({ id }).update({ deleted_at: masterKnex.fn.now() });
}
