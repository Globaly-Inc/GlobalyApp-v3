// Categories service — business/service categories, degree_levels/areas_of_study lookups,
// fee types, issuing organizations, accreditations.

import { NotFoundError } from "../../../../../shared/errors.js";
import * as repo from "../repositories/categories.repository.js";
import type { LookupTable } from "../repositories/categories.repository.js";
import type {
  AccreditationInput, CategoryInput, FeeTypeInput, IssuingOrgInput, LookupInput, RegistrationTypeInput,
  SchemaFieldInput, SchemaFieldEntityType, TestInput,
} from "../schemas/categories.schema.js";

export function listSchemaFields(entityType: SchemaFieldEntityType, entityId: number) {
  return repo.listSchemaFields(entityType, entityId);
}

export function createSchemaField(entityType: SchemaFieldEntityType, entityId: number, data: SchemaFieldInput) {
  return repo.insertSchemaField(entityType, entityId, data);
}

async function requireSchemaField(id: number) {
  const row = await repo.findSchemaFieldById(id);
  if (!row) throw new NotFoundError("Schema field not found");
  return row;
}

export async function updateSchemaField(id: number, data: Partial<SchemaFieldInput>) {
  await requireSchemaField(id);
  return repo.updateSchemaField(id, data);
}

export async function deleteSchemaField(id: number) {
  await requireSchemaField(id);
  await repo.deleteSchemaField(id);
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

// Standard "Course details" fields every service category gets on creation — the service form
// writes/reads values keyed by a real schema_fields id, and silently drops the selection when
// none exists for the category. Also reused (not duplicated) by
// service_category_course_fields_seeder.ts to backfill this onto every category that existed
// before this field set did.
export const STANDARD_COURSE_FIELDS: SchemaFieldInput[] = [
  { key: "degree_level", label: "Degree level", type: "text" },
  { key: "area_of_study", label: "Area of study", type: "text" },
  { key: "awarded_by", label: "Awarded by", type: "text" },
];

export async function createServiceCategory(data: CategoryInput) {
  const category = await repo.insertServiceCategory(data);
  await Promise.all(
    STANDARD_COURSE_FIELDS.map((f) => repo.insertSchemaField("service_categories", category.id, { ...f, is_default: true })),
  );
  return category;
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

export function updateOtherServiceCategory(id: number, data: Partial<CategoryInput>) {
  return repo.updateOtherServiceCategory(id, data);
}

// ── Lookups (degree_levels, areas_of_study) ──

export function listLookup(table: LookupTable, limit: number, offset: number, search?: string) {
  return repo.listLookup(table, limit, offset, search);
}

export function countLookup(table: LookupTable, search?: string) {
  return repo.countLookup(table, search);
}

export function createLookup(table: LookupTable, data: LookupInput | TestInput) {
  return repo.insertLookup(table, data);
}

export async function updateLookup(table: LookupTable, id: number, data: Partial<LookupInput | TestInput>) {
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

// ── Registration Types ──

export const listRegistrationTypes = repo.listRegistrationTypes;
export const countRegistrationTypes = repo.countRegistrationTypes;
export const listActiveRegistrationTypes = repo.listActiveRegistrationTypes;

export function createRegistrationType(data: RegistrationTypeInput) {
  return repo.insertRegistrationType({ ...data, country_id: data.country_id ?? null });
}

async function requireRegistrationType(id: number) {
  const row = await repo.findRegistrationTypeById(id);
  if (!row) throw new NotFoundError("Registration type not found");
  return row;
}

export async function updateRegistrationType(id: number, data: Partial<RegistrationTypeInput>) {
  await requireRegistrationType(id);
  return repo.updateRegistrationType(id, data);
}

export async function deleteRegistrationType(id: number) {
  await requireRegistrationType(id);
  await repo.deleteRegistrationType(id);
}
