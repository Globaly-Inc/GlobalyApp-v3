// Categories repository — business/service categories, default services junction,
// degree_levels/areas_of_study lookups, fee types, issuing organizations, accreditations.

import type { Knex } from "knex";
import { masterKnex } from "../../../../../core/db/master-pool.js";

const now = () => masterKnex.fn.now();

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

// ─── Lookups (degree_levels, areas_of_study) ───────────────────────────────
// Identical shape, so one implementation serves both.

export type LookupTable = "degree_levels" | "areas_of_study";

export async function listLookup(table: LookupTable) {
  return masterKnex(table).whereNull("deleted_at").orderBy("sort_order").orderBy("name");
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

export async function listFeeTypes() {
  return masterKnex("fee_types").whereNull("deleted_at").orderBy("sort_order").orderBy("name");
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

export async function listIssuingOrganizations() {
  return masterKnex("issuing_organizations").orderBy("name");
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

export async function listAccreditations() {
  return masterKnex("accreditations as a")
    .leftJoin("issuing_organizations as o", "o.id", "a.issuing_organization_id")
    .whereNull("a.deleted_at")
    .orderBy("a.sort_order").orderBy("a.name")
    .select("a.*", "o.name as issuing_organization_name", "o.logo_url as issuing_organization_logo_url", scopeCountryIds);
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
