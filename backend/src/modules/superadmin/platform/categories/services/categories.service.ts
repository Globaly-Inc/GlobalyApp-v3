// Categories service — business/service categories, degree_levels/areas_of_study lookups,
// fee types, issuing organizations, accreditations.

import { BadRequestError, ConflictError, NotFoundError } from "../../../../../shared/errors.js";
import * as repo from "../repositories/categories.repository.js";
import type { LookupTable } from "../repositories/categories.repository.js";
import { CORE_SCHEMA_FIELD_TYPES } from "../schemas/categories.schema.js";
import type {
  AccreditationInput, CategoryInput, FeeTypeInput, IssuingOrgInput, LookupInput, SchemaFieldInput,
  SchemaFieldEntityType, SchemaFieldType,
} from "../schemas/categories.schema.js";

/**
 * The booking-form field types belong to **Other** Service Categories only.
 *
 * `schema_fields` is shared by three entity types, and the business/service category forms render by
 * key rather than by type — so letting `time` or `checkbox` be saved against a `service_categories`
 * row would put a field on those forms that nothing knows how to draw. This is the wall between the
 * two category systems: one check, both the create and the update path.
 */
export function assertFieldTypeAllowed(entityType: SchemaFieldEntityType, type: SchemaFieldType | undefined) {
  if (!type || entityType === "other_service_categories") return;
  if (!(CORE_SCHEMA_FIELD_TYPES as readonly string[]).includes(type)) {
    throw new BadRequestError(
      `The "${type}" field type is only available on other service categories. ` +
      `Choose one of: ${CORE_SCHEMA_FIELD_TYPES.join(", ")}.`,
    );
  }
}

export function listSchemaFields(entityType: SchemaFieldEntityType, entityId: number) {
  return repo.listSchemaFields(entityType, entityId);
}

export function createSchemaField(entityType: SchemaFieldEntityType, entityId: number, data: SchemaFieldInput) {
  assertFieldTypeAllowed(entityType, data.type);
  return repo.insertSchemaField(entityType, entityId, data);
}

async function requireSchemaField(id: number) {
  const row = await repo.findSchemaFieldById(id);
  if (!row) throw new NotFoundError("Schema field not found");
  return row;
}

export async function updateSchemaField(id: number, data: Partial<SchemaFieldInput>) {
  // The route addresses the field by id alone, so the entity type it belongs to comes from the row.
  const existing = await requireSchemaField(id);
  assertFieldTypeAllowed(existing.entity_type as SchemaFieldEntityType, data.type);
  return repo.updateSchemaField(id, data);
}

export async function deleteSchemaField(id: number) {
  await requireSchemaField(id);
  await repo.deleteSchemaField(id);
}

/** Reorder one category's fields. Ids that are not this category's are not moved. */
export async function reorderSchemaFields(
  entityType: SchemaFieldEntityType,
  entityId: number,
  fieldIds: number[],
) {
  if (new Set(fieldIds).size !== fieldIds.length) {
    throw new BadRequestError("The same field cannot appear twice in the order");
  }
  await repo.reorderSchemaFields(entityType, entityId, fieldIds);
  return repo.listSchemaFields(entityType, entityId);
}

// ── Business Categories ──

export const listBusinessCategories = repo.listBusinessCategories;
export const countBusinessCategories = repo.countBusinessCategories;

export function createBusinessCategory(data: CategoryInput) {
  return repo.insertBusinessCategory(data);
}

export function updateBusinessCategory(id: number, data: Partial<CategoryInput>) {
  return repo.updateBusinessCategory(id, data);
}

// ── Default Services junction ──

export const getDefaultServices = repo.getDefaultServices;
export const replaceDefaultServices = repo.replaceDefaultServices;

// ── Service Categories (business default-services taxonomy) ──

export const listServiceCategories = repo.listServiceCategories;
export const countServiceCategories = repo.countServiceCategories;

export function createServiceCategory(data: CategoryInput) {
  return repo.insertServiceCategory(data);
}

export function updateServiceCategory(id: number, data: Partial<CategoryInput>) {
  return repo.updateServiceCategory(id, data);
}

// ── Other Service Categories (Earn → My Services) ──

export const listOtherServiceCategories = repo.listOtherServiceCategories;
export const countOtherServiceCategories = repo.countOtherServiceCategories;

export function createOtherServiceCategory(data: CategoryInput) {
  return repo.insertOtherServiceCategory(data);
}

/**
 * Remove an Other Service Category, unless people are already selling under it.
 *
 * Refusing rather than cascading is the point: a listing's category is snapshotted into nothing — orders
 * read it through the listing — so removing a category out from under live listings would break the
 * marketplace pages that render them. Deactivating instead keeps them working while closing it to new
 * listings, which is what an admin usually means.
 */
export async function deleteOtherServiceCategory(id: number) {
  const row = await repo.findOtherServiceCategory(id);
  if (!row) throw new NotFoundError("Other service category not found");

  const listings = await repo.countListingsInOtherServiceCategory(id);
  if (listings > 0) {
    throw new ConflictError(
      `${listings} ${listings === 1 ? "service is" : "services are"} listed under "${row.name}". ` +
      "Turn it off instead — that closes it to new listings without breaking the existing ones.",
    );
  }

  await repo.softDeleteOtherServiceCategory(id);
}

export function updateOtherServiceCategory(id: number, data: Partial<CategoryInput>) {
  return repo.updateOtherServiceCategory(id, data);
}

// ── Lookups (degree_levels, areas_of_study) ──

export function listLookup(table: LookupTable, limit: number, offset: number) {
  return repo.listLookup(table, limit, offset);
}

export function countLookup(table: LookupTable) {
  return repo.countLookup(table);
}

export function createLookup(table: LookupTable, data: LookupInput) {
  return repo.insertLookup(table, data);
}

export async function updateLookup(table: LookupTable, id: number, data: Partial<LookupInput>) {
  const row = await repo.updateLookup(table, id, data);
  if (!row) throw new NotFoundError("Not found");
  return row;
}

// ── Fee Types ──

export const listFeeTypes = repo.listFeeTypes;
export const countFeeTypes = repo.countFeeTypes;

export function createFeeType(data: FeeTypeInput) {
  // Admin-created fee types are platform reference data, already approved.
  return repo.insertFeeType({ ...data, business_id: null, status: "approved", is_global: data.is_global ?? true });
}

async function requireFeeType(id: number) {
  const row = await repo.findFeeTypeById(id);
  if (!row) throw new NotFoundError("Fee type not found");
  return row;
}

export async function updateFeeType(id: number, data: Partial<FeeTypeInput>) {
  await requireFeeType(id);
  return repo.updateFeeType(id, data);
}

export async function reviewFeeType(id: number, decision: "approved" | "rejected", reviewedBy: number) {
  await requireFeeType(id);
  return repo.updateFeeType(id, {
    status: decision,
    is_global: decision === "approved",
    reviewed_by: reviewedBy,
    reviewed_at: new Date(),
  });
}

export async function deleteFeeType(id: number) {
  await requireFeeType(id);
  await repo.deleteFeeType(id);
}

// ── Issuing Organizations ──

export function listIssuingOrganizations(limit: number, offset: number, search?: string) {
  return repo.listIssuingOrganizations(limit, offset, search);
}

export function countIssuingOrganizations(search?: string) {
  return repo.countIssuingOrganizations(search);
}

export function createIssuingOrganization(data: IssuingOrgInput) {
  return repo.insertIssuingOrganization(data);
}

export async function updateIssuingOrganization(id: number, data: Partial<IssuingOrgInput>) {
  const row = await repo.updateIssuingOrganization(id, data);
  if (!row) throw new NotFoundError("Issuing organization not found");
  return row;
}

// ── Accreditations ──

export const listAccreditations = repo.listAccreditations;
export const countAccreditations = repo.countAccreditations;

export function createAccreditation(data: AccreditationInput) {
  const { scope_country_ids = [], ...rest } = data;
  return repo.insertAccreditation({
    ...rest,
    business_id: null,
    status: "approved",
    // "no countries selected" means the accreditation applies everywhere.
    is_global: scope_country_ids.length === 0,
  }, scope_country_ids);
}

async function requireAccreditation(id: number) {
  const row = await repo.findAccreditationById(id);
  if (!row) throw new NotFoundError("Accreditation not found");
  return row;
}

export async function updateAccreditation(id: number, data: Partial<AccreditationInput>) {
  await requireAccreditation(id);
  const { scope_country_ids, ...rest } = data;
  const patch = scope_country_ids ? { ...rest, is_global: scope_country_ids.length === 0 } : rest;
  return repo.updateAccreditation(id, patch, scope_country_ids);
}

export async function reviewAccreditation(id: number, decision: "approved" | "rejected", reviewedBy: number) {
  await requireAccreditation(id);
  return repo.updateAccreditation(id, {
    status: decision,
    is_global: decision === "approved",
    reviewed_by: reviewedBy,
    reviewed_at: new Date(),
  });
}

export async function deleteAccreditation(id: number) {
  await requireAccreditation(id);
  await repo.deleteAccreditation(id);
}
