// Generic repository for all service category extraction tables.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { SERVICE_TABLE_MAP, type ServiceType } from "../schemas/services.schema.js";

function table(serviceType: ServiceType) {
  return `${S}.${SERVICE_TABLE_MAP[serviceType]}`;
}

export async function listItems(
  serviceType: ServiceType,
  opts: { status?: string; job_id?: string; limit: number },
) {
  const query = masterKnex(table(serviceType)).orderBy("created_at", "desc").limit(opts.limit);
  if (opts.status) query.where("status", opts.status);
  if (opts.job_id) query.where("job_id", opts.job_id);
  return query;
}

export async function getItem(serviceType: ServiceType, id: string) {
  return masterKnex(table(serviceType)).where({ id }).first();
}

export async function updateStatus(serviceType: ServiceType, id: string, status: string) {
  const count = await masterKnex(table(serviceType))
    .where({ id })
    .update({ status, updated_at: masterKnex.fn.now() });
  return count > 0;
}

export async function updateItem(serviceType: ServiceType, id: string, data: Record<string, unknown>) {
  const count = await masterKnex(table(serviceType))
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now() });
  return count > 0;
}

export async function deleteItem(serviceType: ServiceType, id: string) {
  const count = await masterKnex(table(serviceType)).where({ id }).delete();
  return count > 0;
}

export async function countByStatus(serviceType: ServiceType) {
  const rows = await masterKnex(table(serviceType))
    .select("status")
    .count("* as count")
    .groupBy("status");
  return rows.reduce(
    (acc, r) => ({ ...acc, [r.status as string]: Number(r.count) }),
    {} as Record<string, number>,
  );
}

export async function promoteItem(serviceType: ServiceType, id: string) {
  // ponytail: real promotion copies to public.business_services — stub marks as promoted
  await masterKnex(table(serviceType))
    .where({ id })
    .update({ status: "promoted", updated_at: masterKnex.fn.now() });
  return id;
}
