// Categories repository — business/service categories, default services junction,
// degree_levels/areas_of_study lookups, fee types, issuing organizations, accreditations.

import type { Knex } from "knex";
import { masterKnex } from "../../../../../core/db/master-pool.js";

const now = () => masterKnex.fn.now();

// ─── Schema Fields (polymorphic: business_categories | service_categories) ─

export type SchemaFieldEntityType = "business_categories" | "service_categories" | "other_service_categories";

const schemaFieldsFor = (entityType: SchemaFieldEntityType) => masterKnex.raw(
  `COALESCE((
    SELECT json_agg(json_build_object(
      'id', sf.id, 'label', sf.label, 'key', sf.key, 'type', sf.type,
      'is_required', sf.is_required, 'filterable', sf.filterable, 'is_default', sf.is_default, 'options', sf.options
    ) ORDER BY sf.id)
    FROM schema_fields sf WHERE sf.entity_id = "${entityType}".id AND sf.entity_type = ?
  ), '[]'::json) as schema_fields`,
  [entityType],
);

export async function listSchemaFields(entityType: SchemaFieldEntityType, entityId: number) {
  return masterKnex("schema_fields").where({ entity_id: entityId, entity_type: entityType }).orderBy("id");
}

export async function findSchemaFieldById(id: number) {
  return masterKnex("schema_fields").where({ id }).first();
}

// pg serializes plain JS arrays as Postgres array literals, not JSON — stringify explicitly for the json column.
const serializeOptions = (data: Record<string, unknown>) =>
  "options" in data ? { ...data, options: data.options == null ? null : JSON.stringify(data.options) } : data;

export async function insertSchemaField(entityType: SchemaFieldEntityType, entityId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("schema_fields")
    .insert({ ...serializeOptions(data), entity_id: entityId, entity_type: entityType })
    .returning("*");
  return row;
}

export async function updateSchemaField(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("schema_fields").where({ id }).update({ ...serializeOptions(data), updated_at: now() }).returning("*");
  return row;
}

export async function deleteSchemaField(id: number) {
  return masterKnex("schema_fields").where({ id }).delete();
}

// ─── Business Categories ───────────────────────────────────────────────────

export async function listBusinessCategories(limit: number, offset: number, search?: string) {
  const q = masterKnex("business_categories").whereNull("deleted_at").orderBy("sort_order").orderBy("name").limit(limit).offset(offset)
    .select("business_categories.*", schemaFieldsFor("business_categories"));
  if (search) q.whereILike("name", `%${search}%`);
  return q;
}

export async function countBusinessCategories(search?: string) {
  const q = masterKnex("business_categories").whereNull("deleted_at").count("* as count");
  if (search) q.whereILike("name", `%${search}%`);
  const [row] = await q;
  return Number(row.count);
}

export async function insertBusinessCategory(data: Record<string, unknown>) {
  const [row] = await masterKnex("business_categories").insert(data).returning("*");
  return row;
}

export async function updateBusinessCategory(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("business_categories").where({ id }).update({ ...data, updated_at: now() }).returning("*");
  return row;
}

// ─── Service Categories (business default-services taxonomy) ──────────────

export async function listServiceCategories(limit: number, offset: number, search?: string) {
  const q = masterKnex("service_categories").whereNull("deleted_at").orderBy("sort_order").orderBy("name").limit(limit).offset(offset)
    .select("service_categories.*", schemaFieldsFor("service_categories"));
  if (search) q.whereILike("name", `%${search}%`);
  return q;
}

export async function countServiceCategories(search?: string) {
  const q = masterKnex("service_categories").whereNull("deleted_at").count("* as count");
  if (search) q.whereILike("name", `%${search}%`);
  const [row] = await q;
  return Number(row.count);
}

export async function insertServiceCategory(data: Record<string, unknown>) {
  const [row] = await masterKnex("service_categories").insert(data).returning("*");
  return row;
}

export async function updateServiceCategory(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("service_categories").where({ id }).update({ ...data, updated_at: now() }).returning("*");
  return row;
}

// ─── Default Services junction ─────────────────────────────────────────────

export async function getDefaultServices(businessCategoryId: number) {
  return masterKnex("business_category_default_services")
    .join("service_categories", "service_categories.id", "business_category_default_services.service_category_id")
    .where({ business_category_id: businessCategoryId })
    .select("service_categories.*");
}

export async function replaceDefaultServices(businessCategoryId: number, serviceCategoryIds: number[]) {
  await masterKnex.transaction(async (trx) => {
    await trx("business_category_default_services").where({ business_category_id: businessCategoryId }).delete();
    if (serviceCategoryIds.length > 0) {
      await trx("business_category_default_services").insert(
        serviceCategoryIds.map((id) => ({ business_category_id: businessCategoryId, service_category_id: id })),
      );
    }
  });
}

// ─── Other Service Categories (Earn → My Services taxonomy) ───────────────

export async function listOtherServiceCategories(limit: number, offset: number, search?: string) {
  const q = masterKnex("other_service_categories").whereNull("deleted_at").orderBy("sort_order").orderBy("name").limit(limit).offset(offset)
    .select("other_service_categories.*", schemaFieldsFor("other_service_categories"));
  if (search) q.whereILike("name", `%${search}%`);
  return q;
}

export async function countOtherServiceCategories(search?: string) {
  const q = masterKnex("other_service_categories").whereNull("deleted_at").count("* as count");
  if (search) q.whereILike("name", `%${search}%`);
  const [row] = await q;
  return Number(row.count);
}

export async function insertOtherServiceCategory(data: Record<string, unknown>) {
  const [row] = await masterKnex("other_service_categories").insert(data).returning("*");
  return row;
}

export async function updateOtherServiceCategory(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("other_service_categories").where({ id }).update({ ...data, updated_at: now() }).returning("*");
  return row;
}

// ─── Lookups (degree_levels, areas_of_study) ───────────────────────────────
// Identical shape, so one implementation serves both.

export type LookupTable = "degree_levels" | "areas_of_study";

export async function listLookup(table: LookupTable, limit: number, offset: number) {
  return masterKnex(table).whereNull("deleted_at").orderBy("sort_order").orderBy("name").limit(limit).offset(offset);
}

export async function countLookup(table: LookupTable) {
  const [row] = await masterKnex(table).whereNull("deleted_at").count("* as count");
  return Number(row.count);
}

export async function insertLookup(table: LookupTable, data: Record<string, unknown>) {
  const [row] = await masterKnex(table).insert(data).returning("*");
  return row;
}

export async function updateLookup(table: LookupTable, id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex(table).where({ id }).whereNull("deleted_at")
    .update({ ...data, updated_at: now() }).returning("*");
  return row;
}

// ─── Fee Types ─────────────────────────────────────────────────────────────

export async function listFeeTypes(limit: number, offset: number) {
  return masterKnex("fee_types").whereNull("deleted_at").orderBy("sort_order").orderBy("name").limit(limit).offset(offset);
}

export async function countFeeTypes() {
  const [row] = await masterKnex("fee_types").whereNull("deleted_at").count("* as count");
  return Number(row.count);
}

export async function findFeeTypeById(id: number) {
  return masterKnex("fee_types").where({ id }).whereNull("deleted_at").first();
}

export async function insertFeeType(data: Record<string, unknown>) {
  const [row] = await masterKnex("fee_types").insert(data).returning("*");
  return row;
}

export async function updateFeeType(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("fee_types").where({ id }).whereNull("deleted_at")
    .update({ ...data, updated_at: now() }).returning("*");
  return row;
}

export async function deleteFeeType(id: number) {
  return masterKnex("fee_types").where({ id }).update({ deleted_at: now() });
}

// ─── Issuing Organizations ─────────────────────────────────────────────────

export async function listIssuingOrganizations(limit: number, offset: number, search?: string) {
  const q = masterKnex("issuing_organizations").orderBy("name").limit(limit).offset(offset);
  if (search) q.whereILike("name", `%${search}%`);
  return q;
}

export async function countIssuingOrganizations(search?: string) {
  const q = masterKnex("issuing_organizations").count("* as count");
  if (search) q.whereILike("name", `%${search}%`);
  const [row] = await q;
  return Number(row.count);
}

export async function insertIssuingOrganization(data: Record<string, unknown>) {
  const [row] = await masterKnex("issuing_organizations").insert(data).returning("*");
  return row;
}

export async function updateIssuingOrganization(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("issuing_organizations").where({ id })
    .update({ ...data, updated_at: now() }).returning("*");
  return row;
}

// ─── Accreditations ────────────────────────────────────────────────────────

const scopeCountryIds = masterKnex.raw(`COALESCE((
  SELECT json_agg(s.country_id ORDER BY s.country_id)
  FROM accreditation_scope_countries s WHERE s.accreditation_id = a.id
), '[]'::json) as scope_country_ids`);

export async function listAccreditations(limit: number, offset: number) {
  return masterKnex("accreditations as a")
    .leftJoin("issuing_organizations as o", "o.id", "a.issuing_organization_id")
    .whereNull("a.deleted_at")
    .orderBy("a.sort_order").orderBy("a.name")
    .limit(limit).offset(offset)
    .select("a.*", "o.name as issuing_organization_name", "o.logo_url as issuing_organization_logo_url", scopeCountryIds);
}

export async function countAccreditations() {
  const [row] = await masterKnex("accreditations").whereNull("deleted_at").count("* as count");
  return Number(row.count);
}

export async function findAccreditationById(id: number) {
  return masterKnex("accreditations").where({ id }).whereNull("deleted_at").first();
}

async function replaceScopeCountries(trx: Knex.Transaction, accreditationId: number, countryIds: number[]) {
  await trx("accreditation_scope_countries").where({ accreditation_id: accreditationId }).delete();
  if (countryIds.length > 0) {
    await trx("accreditation_scope_countries").insert(
      countryIds.map((country_id) => ({ accreditation_id: accreditationId, country_id })),
    );
  }
}

export async function insertAccreditation(data: Record<string, unknown>, countryIds: number[]) {
  return masterKnex.transaction(async (trx) => {
    const [row] = await trx("accreditations").insert(data).returning("*");
    await replaceScopeCountries(trx, row.id, countryIds);
    return row;
  });
}

export async function updateAccreditation(id: number, data: Record<string, unknown>, countryIds?: number[]) {
  return masterKnex.transaction(async (trx) => {
    const [row] = await trx("accreditations").where({ id }).whereNull("deleted_at")
      .update({ ...data, updated_at: now() }).returning("*");
    if (countryIds) await replaceScopeCountries(trx, id, countryIds);
    return row;
  });
}

export async function deleteAccreditation(id: number) {
  return masterKnex("accreditations").where({ id }).update({ deleted_at: now() });
}
