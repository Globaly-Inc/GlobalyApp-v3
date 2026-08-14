// Repository for platform management — users, countries, feature flags, site access.
// Categories and catalog (business/service categories, lookups, fee types, accreditations)
// live in ./categories/repositories/categories.repository.ts. Business CRUD, members, and
// activity live in ./businesses/repositories/businesses.repository.ts. Branches, services,
// contacts, partners, and representations each live in their own ./business-*/repositories/ module.

import { masterKnex } from "../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../consts.js";
import { findAdminByPlatformUserId } from "../admin-users/repositories/admin-users.repository.js";
const now = () => masterKnex.fn.now();

// business-* sibling modules use this to verify a business exists before touching its sub-resources.
export { findBusinessById } from "./businesses/repositories/businesses.repository.js";

// ─── User management ───────────────────────────────────────────────────────

export async function listUsers(limit: number, offset: number, search?: string) {
  const q = masterKnex("platform_users")
    .select("id", "uuid", "first_name", "last_name", "email", "phone",
      "account_status", "photo_url", "is_email_verified",
      "is_personal_account", "is_business_account", "account_categories", "created_at")
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

export async function logAdminAction(platformUserId: number, action: string, entityType: string, entityId?: string, details?: Record<string, unknown>) {
  const admin = await findAdminByPlatformUserId(platformUserId);
  if (!admin) return;
  await masterKnex(`${S}.admin_audit_logs`).insert({
    admin_id: admin.id,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null, // uuid column — null if not applicable
    details: JSON.stringify(details ?? {}),
  });
}

