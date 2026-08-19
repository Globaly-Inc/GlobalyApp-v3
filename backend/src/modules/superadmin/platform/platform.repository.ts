// Repository for platform management — users, countries, feature flags, site access.
// Categories and catalog (business/service categories, lookups, fee types, accreditations)
// live in ./categories/repositories/categories.repository.ts. Business CRUD, members, and
// activity live in ./businesses/repositories/businesses.repository.ts. Branches, services,
// contacts, partners, and representations each live in their own ./business-*/repositories/ module.

import type { Knex } from "knex";
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

type CountryListFilters = { search?: string; filter?: "all" | "active" | "featured" };

function applyCountryFilters<T extends Knex.QueryBuilder>(q: T, filters: CountryListFilters, column = "countries"): T {
  if (filters.search) q.whereILike(`${column}.name`, `%${filters.search}%`);
  if (filters.filter === "active") q.where(`${column}.is_active`, true);
  if (filters.filter === "featured") q.where(`${column}.is_featured`, true);
  return q;
}

export async function listCountriesAdmin(limit: number, offset: number, filters: CountryListFilters) {
  const q = masterKnex("countries")
    .select("countries.*")
    .count("cities.id as city_count")
    .leftJoin("cities", function () {
      this.on("cities.country_id", "countries.id").onNull("cities.deleted_at");
    })
    .whereNull("countries.deleted_at")
    .groupBy("countries.id")
    .orderBy("countries.name")
    .limit(limit)
    .offset(offset);
  return applyCountryFilters(q, filters);
}

export async function countCountriesAdmin(filters: CountryListFilters) {
  const q = masterKnex("countries").whereNull("deleted_at");
  applyCountryFilters(q, filters, "countries");
  const [row] = await q.count("* as count");
  return Number(row.count);
}

export async function countCountryStats() {
  const [row] = await masterKnex("countries")
    .whereNull("deleted_at")
    .select(
      masterKnex.raw("count(*) as total"),
      masterKnex.raw("count(*) filter (where is_active) as active"),
      masterKnex.raw("count(*) filter (where is_featured) as featured"),
    );
  return { total: Number(row.total), active: Number(row.active), featured: Number(row.featured) };
}

export async function findCountryById(id: number) {
  return masterKnex("countries").where({ id }).whereNull("deleted_at").first();
}

// Public, unauthenticated reads — see modules/geo/routes/public-geo.routes.ts.
// hero_image_url is the marketing photograph the home-page destination shelf renders; it is public
// data on a public shelf. Named columns only — never widen this to select *, which would put the
// admin-only editorial columns of a shared table on an unauthenticated route.
export async function listFeaturedCountries() {
  return masterKnex("countries")
    .select("id", "name", "slug", "flag_emoji", "hero_image_url")
    .where({ is_active: true, is_featured: true })
    .whereNull("deleted_at")
    .orderBy("sort_order")
    .orderBy("name");
}

/**
 * Every active country, for the country pickers on public pages. Named columns, not
 * `countries.*`: this is anonymous, and the table also carries admin-only editorial
 * fields. A picker needs an id, a label, and a flag — nothing else.
 */
export async function listPublicCountries() {
  return masterKnex("countries")
    .select("id", "name", "slug", "iso2", "flag_emoji")
    .where({ is_active: true })
    .whereNull("deleted_at")
    .orderBy("name");
}

export async function findPublicCountryBySlug(slug: string) {
  const country = await masterKnex("countries")
    .where({ is_active: true })
    .whereNull("deleted_at")
    .where((b) => b.where("slug", slug).orWhereRaw("lower(name) = lower(?)", [slug]))
    .first();
  // `languages`/`gallery_images` are nullable columns (admin-entered, not seeded) — the public
  // contract promises arrays, so coerce null to [] here rather than in every consumer.
  return country && { ...country, languages: country.languages ?? [], gallery_images: country.gallery_images ?? [] };
}

export async function listPublicCitiesForCountry(countryId: number, limit = 12) {
  return masterKnex("cities")
    .select("id", "country_id", "name", "slug", "thumbnail_image_url", "hero_image_url", "population_label", "is_featured")
    .where({ country_id: countryId, status: "active" })
    .whereNull("deleted_at")
    .orderBy("sort_order")
    .orderBy("name")
    .limit(limit);
}

export async function findPublicCityBySlug(citySlug: string, countrySlug?: string) {
  const query = masterKnex("cities as ci")
    .join("countries as co", "co.id", "ci.country_id")
    .where("ci.status", "active")
    .whereNull("ci.deleted_at")
    .where((b) => b.where("ci.slug", citySlug).orWhereRaw("lower(ci.name) = lower(?)", [citySlug]));
  if (countrySlug) {
    query.where((b) => b.where("co.slug", countrySlug).orWhereRaw("lower(co.name) = lower(?)", [countrySlug]));
  }
  return query
    .select(
      "ci.id", "ci.name", "ci.slug", "ci.hero_image_url", "ci.thumbnail_image_url", "ci.about",
      "ci.population_label", "ci.area_label", "ci.weather_label", "ci.timezone", "ci.highlights",
      "ci.is_featured", "ci.meta_title", "ci.meta_description",
      "co.id as country_id", "co.name as country_name", "co.slug as country_slug", "co.flag_emoji as country_flag_emoji",
    )
    .first();
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

