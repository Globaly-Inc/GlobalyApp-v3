// Repository for the business_services table — lives in each business's own tenant schema —
// plus its schema_field_values (dynamic per-category fields, e.g. Degree Level).

import { getKnex } from "../../../../../core/db/pool-manager.js";

const SERVICE_COLUMNS = [
  "uuid as id", "service_category_id", "name", "description", "price", "is_published", "public_visibility", "created_at",
];

function serviceWithCategory(db: Awaited<ReturnType<typeof getKnex>>) {
  return db("business_services as s")
    .leftJoin("service_categories as cat", "cat.id", "s.service_category_id")
    .whereNull("s.deleted_at")
    .select([...SERVICE_COLUMNS.map((c) => `s.${c}`), "cat.name as category_name"]);
}

export async function listServices(businessId: number, schemaName: string) {
  const db = await getKnex(businessId, schemaName);
  return serviceWithCategory(db).orderBy("s.created_at", "desc");
}

/** Batch fetch each service's degree_level/area_of_study schema-field values + its first
 * study option's duration — the "table" columns list/search views need beyond the base row. */
export async function getServiceListExtras(businessId: number, schemaName: string, serviceIds: string[]) {
  if (serviceIds.length === 0) return { fieldValues: [], durations: [] };
  const db = await getKnex(businessId, schemaName);
  const [fieldValues, durations] = await Promise.all([
    db("schema_field_values as v")
      .join("schema_fields as f", "f.id", "v.schema_field_id")
      .where({ "v.entity_type": "business_services" })
      .whereIn("v.entity_id", serviceIds)
      .whereIn("f.key", ["degree_level", "area_of_study"])
      .select("v.entity_id as service_id", "f.key", "v.value"),
    db("service_study_options")
      .whereIn("service_id", serviceIds)
      .whereNotNull("duration_value")
      .select("service_id", "duration_value", "duration_unit")
      .orderBy("created_at", "asc"),
  ]);
  return { fieldValues, durations };
}

export async function searchServices(businessId: number, schemaName: string, limit: number, offset: number, search?: string) {
  const db = await getKnex(businessId, schemaName);
  const base = () => {
    const q = db("business_services as s").leftJoin("service_categories as cat", "cat.id", "s.service_category_id").whereNull("s.deleted_at");
    if (search) q.whereILike("s.name", `%${search}%`);
    return q;
  };
  const [{ count }] = await base().count<{ count: string }[]>("s.id as count");
  const rows = await base()
    .select([...SERVICE_COLUMNS.map((c) => `s.${c}`), "cat.name as category_name"])
    .orderBy("s.name")
    .limit(limit)
    .offset(offset);
  return { rows, total: Number(count) };
}

export async function getService(businessId: number, schemaName: string, serviceId: string) {
  const db = await getKnex(businessId, schemaName);
  return serviceWithCategory(db).where("s.uuid", serviceId).first();
}

export async function createService(businessId: number, schemaName: string, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  const [{ uuid: id }] = await db("business_services").insert(data).returning("uuid");
  return serviceWithCategory(db).where("s.uuid", id).first();
}

export async function updateService(businessId: number, schemaName: string, serviceId: string, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  await db("business_services").where({ uuid: serviceId }).update({ ...data, updated_at: db.fn.now() });
  return serviceWithCategory(db).where("s.uuid", serviceId).first();
}

export async function setServicePublished(businessId: number, schemaName: string, serviceId: string, isPublished: boolean) {
  const db = await getKnex(businessId, schemaName);
  await db("business_services").where({ uuid: serviceId }).update({ is_published: isPublished, updated_at: db.fn.now() });
  return serviceWithCategory(db).where("s.uuid", serviceId).first();
}

export async function deleteService(businessId: number, schemaName: string, serviceId: string) {
  const db = await getKnex(businessId, schemaName);
  return db("business_services").where({ uuid: serviceId }).update({ deleted_at: db.fn.now() });
}

// ─── Service field values (dynamic per-category fields, e.g. Degree Level) ────

export async function getServiceFieldValues(businessId: number, schemaName: string, serviceId: string) {
  const db = await getKnex(businessId, schemaName);
  return db("schema_field_values")
    .where({ entity_type: "business_services", entity_id: serviceId })
    .select("schema_field_id", "value");
}

export async function upsertServiceFieldValues(
  businessId: number,
  schemaName: string,
  serviceId: string,
  values: { schema_field_id: number; value?: unknown }[],
) {
  const db = await getKnex(businessId, schemaName);
  await db.transaction(async (trx) => {
    for (const { schema_field_id, value } of values) {
      await trx("schema_field_values")
        .insert({ entity_type: "business_services", entity_id: serviceId, schema_field_id, value: JSON.stringify(value) })
        .onConflict(["entity_id", "entity_type", "schema_field_id"])
        .merge({ value: JSON.stringify(value), updated_at: trx.fn.now() });
    }
  });
  return getServiceFieldValues(businessId, schemaName, serviceId);
}
