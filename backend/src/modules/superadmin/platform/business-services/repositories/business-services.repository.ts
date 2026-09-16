// Repository for the business_services table — lives in each business's own tenant schema —
// plus its schema_field_values (dynamic per-category fields, e.g. Degree Level).

import { getKnex } from "../../../../../core/db/pool-manager.js";
import { NotFoundError } from "../../../../../shared/errors.js";

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

/** Materializes a real business_services row under an EXPLICIT uuid — used to promote a
 * read-only extraction stand-in (whose id the frontend already has and every sub-resource
 * request already carries) into a real, writable row on first edit. */
export async function materializeService(businessId: number, schemaName: string, uuid: string, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  await db("business_services").insert({ ...data, uuid }).onConflict("uuid").ignore();
}

export async function createService(businessId: number, schemaName: string, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  const [{ uuid: id }] = await db("business_services").insert(data).returning("uuid");
  return serviceWithCategory(db).where("s.uuid", id).first();
}

export async function updateService(businessId: number, schemaName: string, serviceId: string, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  const patch = "public_visibility" in data ? { ...data, public_visibility: JSON.stringify(data.public_visibility) } : data;
  await db("business_services").where({ uuid: serviceId }).update({ ...patch, updated_at: db.fn.now() });
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

// ─── Service fees ──────────────────────────────────────────────────────────

export async function listServiceFees(businessId: number, schemaName: string, serviceId: string) {
  const db = await getKnex(businessId, schemaName);
  return db("service_fees").where({ service_id: serviceId }).orderBy("created_at", "asc");
}

// installments is jsonb — the pg driver stringifies top-level query params but not nested
// arrays/objects inside them, so an un-stringified array lands as "[object Object]" and pg
// rejects it as invalid JSON (see schema_field_values' same JSON.stringify(value) above).
function withStringifiedInstallments(data: Record<string, unknown>) {
  return "installments" in data ? { ...data, installments: JSON.stringify(data.installments) } : data;
}

export async function createServiceFee(businessId: number, schemaName: string, serviceId: string, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  const [row] = await db("service_fees").insert({ ...withStringifiedInstallments(data), service_id: serviceId }).returning("*");
  return row;
}

export async function updateServiceFee(businessId: number, schemaName: string, serviceId: string, feeId: number, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  const [row] = await db("service_fees").where({ id: feeId, service_id: serviceId }).update({ ...withStringifiedInstallments(data), updated_at: db.fn.now() }).returning("*");
  if (!row) throw new NotFoundError("Fee not found");
  return row;
}

export async function deleteServiceFee(businessId: number, schemaName: string, serviceId: string, feeId: number) {
  const db = await getKnex(businessId, schemaName);
  const deleted = await db("service_fees").where({ id: feeId, service_id: serviceId }).delete();
  if (!deleted) throw new NotFoundError("Fee not found");
}

// ─── Service intakes ───────────────────────────────────────────────────────

export async function listServiceIntakes(businessId: number, schemaName: string, serviceId: string) {
  const db = await getKnex(businessId, schemaName);
  return db("service_intakes").where({ service_id: serviceId }).orderBy("created_at", "asc");
}

export async function createServiceIntake(businessId: number, schemaName: string, serviceId: string, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  const [row] = await db("service_intakes").insert({ ...data, service_id: serviceId }).returning("*");
  return row;
}

export async function updateServiceIntake(businessId: number, schemaName: string, serviceId: string, intakeId: number, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  const [row] = await db("service_intakes").where({ id: intakeId, service_id: serviceId }).update({ ...data, updated_at: db.fn.now() }).returning("*");
  if (!row) throw new NotFoundError("Intake not found");
  return row;
}

export async function deleteServiceIntake(businessId: number, schemaName: string, serviceId: string, intakeId: number) {
  const db = await getKnex(businessId, schemaName);
  const deleted = await db("service_intakes").where({ id: intakeId, service_id: serviceId }).delete();
  if (!deleted) throw new NotFoundError("Intake not found");
}

// ─── Service eligibility requirements ──────────────────────────────────────

export async function listServiceEligibility(businessId: number, schemaName: string, serviceId: string) {
  const db = await getKnex(businessId, schemaName);
  return db("service_eligibility_requirements").where({ service_id: serviceId }).orderBy("created_at", "asc");
}

// academic_tests/language_tests are jsonb — same JSON.stringify requirement as installments above.
function withStringifiedTests(data: Record<string, unknown>) {
  const next = { ...data };
  if ("academic_tests" in next) next.academic_tests = JSON.stringify(next.academic_tests);
  if ("language_tests" in next) next.language_tests = JSON.stringify(next.language_tests);
  return next;
}

export async function createServiceEligibility(businessId: number, schemaName: string, serviceId: string, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  const [row] = await db("service_eligibility_requirements").insert({ ...withStringifiedTests(data), service_id: serviceId }).returning("*");
  return row;
}

export async function updateServiceEligibility(businessId: number, schemaName: string, serviceId: string, eligibilityId: number, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  const [row] = await db("service_eligibility_requirements").where({ id: eligibilityId, service_id: serviceId }).update({ ...withStringifiedTests(data), updated_at: db.fn.now() }).returning("*");
  if (!row) throw new NotFoundError("Eligibility requirement not found");
  return row;
}

export async function deleteServiceEligibility(businessId: number, schemaName: string, serviceId: string, eligibilityId: number) {
  const db = await getKnex(businessId, schemaName);
  const deleted = await db("service_eligibility_requirements").where({ id: eligibilityId, service_id: serviceId }).delete();
  if (!deleted) throw new NotFoundError("Eligibility requirement not found");
}

// ─── Service study options ──────────────────────────────────────────────────

export async function listServiceStudyOptions(businessId: number, schemaName: string, serviceId: string) {
  const db = await getKnex(businessId, schemaName);
  return db("service_study_options").where({ service_id: serviceId }).orderBy("created_at", "asc");
}

export async function createServiceStudyOption(businessId: number, schemaName: string, serviceId: string, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  const [row] = await db("service_study_options").insert({ ...data, service_id: serviceId }).returning("*");
  return row;
}

export async function updateServiceStudyOption(businessId: number, schemaName: string, serviceId: string, optionId: number, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  const [row] = await db("service_study_options").where({ id: optionId, service_id: serviceId }).update({ ...data, updated_at: db.fn.now() }).returning("*");
  if (!row) throw new NotFoundError("Study option not found");
  return row;
}

export async function deleteServiceStudyOption(businessId: number, schemaName: string, serviceId: string, optionId: number) {
  const db = await getKnex(businessId, schemaName);
  const deleted = await db("service_study_options").where({ id: optionId, service_id: serviceId }).delete();
  if (!deleted) throw new NotFoundError("Study option not found");
}

// ─── Service study units ────────────────────────────────────────────────────

export async function listServiceStudyUnits(businessId: number, schemaName: string, serviceId: string) {
  const db = await getKnex(businessId, schemaName);
  return db("service_study_units").where({ service_id: serviceId }).orderBy("created_at", "asc");
}

export async function createServiceStudyUnit(businessId: number, schemaName: string, serviceId: string, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  const [row] = await db("service_study_units").insert({ ...data, service_id: serviceId }).returning("*");
  return row;
}

export async function updateServiceStudyUnit(businessId: number, schemaName: string, serviceId: string, unitId: number, data: Record<string, unknown>) {
  const db = await getKnex(businessId, schemaName);
  const [row] = await db("service_study_units").where({ id: unitId, service_id: serviceId }).update({ ...data, updated_at: db.fn.now() }).returning("*");
  if (!row) throw new NotFoundError("Study unit not found");
  return row;
}

export async function deleteServiceStudyUnit(businessId: number, schemaName: string, serviceId: string, unitId: number) {
  const db = await getKnex(businessId, schemaName);
  const deleted = await db("service_study_units").where({ id: unitId, service_id: serviceId }).delete();
  if (!deleted) throw new NotFoundError("Study unit not found");
}

// ─── Service accreditations ─────────────────────────────────────────────────

export async function listServiceAccreditations(businessId: number, schemaName: string, serviceId: string) {
  const db = await getKnex(businessId, schemaName);
  return db("service_accreditations").where({ service_id: serviceId }).orderBy("created_at", "asc");
}

export async function createServiceAccreditation(businessId: number, schemaName: string, serviceId: string, accreditationId: number) {
  const db = await getKnex(businessId, schemaName);
  const [row] = await db("service_accreditations").insert({ service_id: serviceId, accreditation_id: accreditationId }).returning("*");
  return row;
}

export async function deleteServiceAccreditation(businessId: number, schemaName: string, serviceId: string, accreditationRowId: number) {
  const db = await getKnex(businessId, schemaName);
  const deleted = await db("service_accreditations").where({ id: accreditationRowId, service_id: serviceId }).delete();
  if (!deleted) throw new NotFoundError("Accreditation not found");
}
