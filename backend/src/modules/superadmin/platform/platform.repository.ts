// Repository for platform management — businesses, users, categories, countries, feature flags, site access.

import { masterKnex } from "../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../consts.js";
const now = () => masterKnex.fn.now();

// ─── Business management ───────────────────────────────────────────────────

export async function listBusinesses(limit: number, offset: number, search?: string, status?: string) {
  const q = masterKnex("businesses")
    .select("id", "business_name", "subdomain", "business_type", "email", "phone",
      "status", "is_published", "country_id", "city", "logo_url", "account_status", "created_at")
    .whereNull("deleted_at")
    .orderBy("created_at", "desc")
    .limit(limit).offset(offset);
  if (search) q.where((b) => b.whereILike("business_name", `%${search}%`).orWhereILike("email", `%${search}%`).orWhereILike("subdomain", `%${search}%`));
  if (status) q.where({ status });
  return q;
}

export async function countBusinesses(search?: string, status?: string) {
  const q = masterKnex("businesses").whereNull("deleted_at").count("* as count");
  if (search) q.where((b) => b.whereILike("business_name", `%${search}%`).orWhereILike("email", `%${search}%`).orWhereILike("subdomain", `%${search}%`));
  if (status) q.where({ status });
  const [row] = await q;
  return Number(row.count);
}

export async function findBusinessById(id: string) {
  return masterKnex("businesses").where({ id }).whereNull("deleted_at").first();
}

export async function updateBusiness(id: string, data: Record<string, unknown>) {
  const [row] = await masterKnex("businesses").where({ id }).update({ ...data, updated_at: now() }).returning("*");
  return row;
}

export async function deleteBusiness(id: string) {
  return masterKnex("businesses").where({ id }).update({ deleted_at: masterKnex.fn.now() });
}

// ─── User management ───────────────────────────────────────────────────────

export async function listUsers(limit: number, offset: number, search?: string) {
  const q = masterKnex("platform_users")
    .select("id", "uuid", "first_name", "last_name", "email", "phone",
      "account_status", "photo_url", "user_category", "user_sub_category", "is_email_verified", "created_at")
    .whereNull("deleted_at")
    .orderBy("created_at", "desc")
    .limit(limit).offset(offset);
  if (search) q.where((b) => b.whereILike("first_name", `%${search}%`).orWhereILike("last_name", `%${search}%`).orWhereILike("email", `%${search}%`));
  return q;
}

export async function countUsers(search?: string) {
  const q = masterKnex("platform_users").whereNull("deleted_at").count("* as count");
  if (search) q.where((b) => b.whereILike("first_name", `%${search}%`).orWhereILike("last_name", `%${search}%`).orWhereILike("email", `%${search}%`));
  const [row] = await q;
  return Number(row.count);
}

export async function findUserById(id: number) {
  return masterKnex("platform_users").where({ id }).whereNull("deleted_at").first();
}

export async function updateUser(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("platform_users").where({ id }).update({ ...data, updated_at: now() }).returning("*");
  return row;
}

// ─── Business Categories ───────────────────────────────────────────────────

export async function listBusinessCategories() {
  return masterKnex("business_categories").whereNull("deleted_at").orderBy("sort_order").orderBy("name");
}

export async function insertBusinessCategory(data: Record<string, unknown>) {
  const [row] = await masterKnex("business_categories").insert(data).returning("*");
  return row;
}

export async function updateBusinessCategory(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("business_categories").where({ id }).update({ ...data, updated_at: now() }).returning("*");
  return row;
}

// ─── Service Categories ────────────────────────────────────────────────────

export async function listServiceCategories() {
  return masterKnex("service_categories").whereNull("deleted_at").orderBy("sort_order").orderBy("name");
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

// ─── Countries ─────────────────────────────────────────────────────────────

export async function listCountriesAdmin() {
  return masterKnex("countries")
    .select("countries.*")
    .count("cities.id as city_count")
    .leftJoin("cities", function () {
      this.on("cities.country_id", "countries.id").onNull("cities.deleted_at");
    })
    .whereNull("countries.deleted_at")
    .groupBy("countries.id")
    .orderBy("countries.name");
}

export async function findCountryById(id: number) {
  return masterKnex("countries").where({ id }).whereNull("deleted_at").first();
}

export async function insertCountry(data: Record<string, unknown>) {
  const [row] = await masterKnex("countries").insert(data).returning("*");
  return row;
}

export async function updateCountry(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("countries").where({ id }).update({ ...data, updated_at: now() }).returning("*");
  return row;
}

export async function deleteCountry(id: number) {
  return masterKnex("countries").where({ id }).update({ deleted_at: masterKnex.fn.now() });
}

// ─── Cities ────────────────────────────────────────────────────────────────

export async function listCitiesByCountry(countryId: number) {
  return masterKnex("cities").where({ country_id: countryId }).whereNull("deleted_at").orderBy("name");
}

export async function insertCity(data: Record<string, unknown>) {
  const [row] = await masterKnex("cities").insert(data).returning("*");
  return row;
}

export async function updateCity(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("cities").where({ id }).update({ ...data, updated_at: now() }).returning("*");
  return row;
}

export async function deleteCity(id: number) {
  return masterKnex("cities").where({ id }).update({ deleted_at: masterKnex.fn.now() });
}

// ─── Feature Flags ─────────────────────────────────────────────────────────

export async function listFeatureFlags() {
  return masterKnex(`${S}.feature_flags`).whereNull("deleted_at").orderBy("flag_key");
}

export async function findFeatureFlag(key: string) {
  return masterKnex(`${S}.feature_flags`).where({ flag_key: key }).whereNull("deleted_at").first();
}

export async function upsertFeatureFlag(key: string, isEnabled: boolean, updatedBy: number, description?: string) {
  const existing = await findFeatureFlag(key);
  if (existing) {
    const [row] = await masterKnex(`${S}.feature_flags`).where({ flag_key: key })
      .update({ is_enabled: isEnabled, updated_by: updatedBy, updated_at: now() }).returning("*");
    return row;
  }
  const [row] = await masterKnex(`${S}.feature_flags`)
    .insert({ flag_key: key, is_enabled: isEnabled, description, updated_by: updatedBy }).returning("*");
  return row;
}

// ─── Site Access ───────────────────────────────────────────────────────────

export async function getSiteAccess() {
  return masterKnex(`${S}.site_access_settings`).first();
}

export async function updateSiteAccess(data: Record<string, unknown>, updatedBy: number) {
  const [row] = await masterKnex(`${S}.site_access_settings`)
    .update({ ...data, updated_by: updatedBy, updated_at: now() }).returning("*");
  return row;
}

// ─── Audit logging ─────────────────────────────────────────────────────────

export async function logAdminAction(adminId: number, action: string, entityType: string, entityId?: string, details?: Record<string, unknown>) {
  await masterKnex(`${S}.admin_audit_logs`).insert({
    admin_id: adminId,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null, // uuid column — null if not applicable
    details: JSON.stringify(details ?? {}),
  });
}
