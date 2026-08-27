// Platform user repository — queries against globalyapp platform_users / platform_user_profiles / sub-resource tables.
// Auth state (OTP, sessions) is in auth.repository.ts — NOT here.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";

export interface AccountCategory {
  type: "personal" | "business" | "institution";
  role: string;
}

export interface PlatformUserRow {
  id: number;
  uuid: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  account_status: number;
  photo_url: string | null;
  cover_url: string | null;
  is_email_verified: boolean;
  is_personal_account: boolean;
  is_business_account: boolean;
  is_institution_account: boolean;
  account_categories: AccountCategory[];
  meta: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

const SAFE_COLUMNS = [
  "id", "uuid", "first_name", "last_name", "email", "phone",
  "account_status", "photo_url", "cover_url", "is_email_verified",
  "is_personal_account", "is_business_account", "is_institution_account", "account_categories",
  "meta", "created_at", "updated_at",
] as const;

// ── User lookups ──

export async function findByEmail(email: string) {
  return masterKnex<PlatformUserRow>("platform_users").where({ email }).whereNull("deleted_at").first() as Promise<PlatformUserRow | undefined>;
}

export async function findById(id: number) {
  return masterKnex("platform_users")
    .select(SAFE_COLUMNS as unknown as string[])
    .where({ id })
    .whereNull("deleted_at")
    .first() as Promise<PlatformUserRow | undefined>;
}

export async function findByIdFull(id: number) {
  return masterKnex<PlatformUserRow>("platform_users").where({ id }).whereNull("deleted_at").first<PlatformUserRow>();
}

export async function insert(data: {
  first_name: string;
  last_name: string;
  email: string;
  account_status: number;
  phone?: string;
  is_personal_account?: boolean;
  /** Arbitrary jsonb. Registration uses it to stash a validated `pending_referral` for the OTP step. */
  meta?: Record<string, unknown>;
}, db: Knex = masterKnex) {
  const { meta, ...rest } = data;
  const [row] = await db<PlatformUserRow>("platform_users")
    .insert({
      ...rest,
      // Only set when provided, so the column default ('{}') still applies otherwise. pg serialises a
      // plain object into jsonb, so no manual JSON.stringify.
      ...(meta ? { meta } : {}),
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
    .returning("*");
  return row;
}

export async function updateUser(userId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("platform_users")
    .where({ id: userId })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

/** Append a category entry to account_categories if it doesn't already exist. */
export async function addAccountCategory(userId: number, category: AccountCategory) {
  const user = await findByIdFull(userId);
  if (!user) return;
  const existing: AccountCategory[] = Array.isArray(user.account_categories) ? user.account_categories : [];
  const alreadyExists = existing.some((c) => c.type === category.type && c.role === category.role);
  if (alreadyExists) return;
  const updated = [...existing, category];
  await masterKnex("platform_users")
    .where({ id: userId })
    .update({ account_categories: JSON.stringify(updated), updated_at: masterKnex.fn.now() });
}

// ── Business Index (master DB) ──

export async function listUserBusinesses(platformUserId: number) {
  return masterKnex("user_business_index")
    .join("businesses", "user_business_index.business_id", "businesses.id")
    .where("user_business_index.platform_user_id", platformUserId)
    .where("businesses.account_status", 1)
    .whereNull("user_business_index.deleted_at")
    .whereNull("businesses.deleted_at")
    .select(
      "businesses.id",
      "businesses.schema_name as org_id",
      "businesses.business_name",
      "businesses.subdomain",
      "businesses.logo_url",
      "user_business_index.role",
      "user_business_index.is_owner",
    );
}

/**
 * Upsert a membership. Doubles as the role-change path, since the conflict target is the
 * (user, business) pair.
 *
 * `deleted_at: null` is part of the merge: the unique constraint covers soft-deleted rows
 * too, so re-adding someone who was previously removed would otherwise merge onto their
 * tombstoned row and leave it invisible to listUserBusinesses.
 */
export async function insertUserBusinessIndex(data: {
  platform_user_id: number;
  business_id: number;
  role: string;
  is_owner: boolean;
}) {
  await masterKnex("user_business_index")
    .insert({ ...data, created_at: masterKnex.fn.now() })
    .onConflict(["platform_user_id", "business_id"])
    .merge({ role: data.role, is_owner: data.is_owner, deleted_at: null });
}

/** Mirrors softDeleteAgent — a removed member must stop appearing in their business list. */
export async function softDeleteUserBusinessIndex(platformUserId: number, businessId: number) {
  await masterKnex("user_business_index")
    .where({ platform_user_id: platformUserId, business_id: businessId })
    .whereNull("deleted_at")
    .update({ deleted_at: masterKnex.fn.now() });
}

export async function findBusinessByDbName(dbName: string) {
  return masterKnex("businesses")
    .where({ schema_name: dbName, account_status: 1 })
    .whereNull("deleted_at")
    .first();
}

// ── Profile ──

export async function findProfileByUserId(userId: number) {
  return masterKnex<Record<string, unknown>>("platform_user_profiles").where({ user_id: userId }).whereNull("deleted_at").first<Record<string, unknown>>();
}

export async function insertProfile(userId: number, data: Record<string, unknown> = {}) {
  const [row] = await masterKnex("platform_user_profiles")
    .insert({ user_id: userId, ...data })
    .returning("*");
  return row;
}

export async function updateProfile(userId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("platform_user_profiles")
    .where({ user_id: userId })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

// ── Qualifications ──

export async function listQualifications(userId: number) {
  return masterKnex("platform_user_qualifications").where({ user_id: userId }).whereNull("deleted_at").orderBy("sort_order");
}

export async function insertQualification(userId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("platform_user_qualifications")
    .insert({ user_id: userId, ...data })
    .returning("*");
  return row;
}

export async function updateQualification(id: string, userId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("platform_user_qualifications")
    .where({ id, user_id: userId })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function deleteQualification(id: string, userId: number) {
  return masterKnex("platform_user_qualifications").where({ id, user_id: userId }).update({ deleted_at: masterKnex.fn.now() });
}

// ── Language Tests ──

export async function listLanguageTests(userId: number) {
  return masterKnex("platform_user_language_tests").where({ user_id: userId }).whereNull("deleted_at").orderBy("sort_order");
}

export async function insertLanguageTest(userId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("platform_user_language_tests")
    .insert({ user_id: userId, ...data })
    .returning("*");
  return row;
}

export async function updateLanguageTest(id: string, userId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("platform_user_language_tests")
    .where({ id, user_id: userId })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function deleteLanguageTest(id: string, userId: number) {
  return masterKnex("platform_user_language_tests").where({ id, user_id: userId }).update({ deleted_at: masterKnex.fn.now() });
}

// ── Academic Tests ──

export async function listAcademicTests(userId: number) {
  return masterKnex("platform_user_academic_tests").where({ user_id: userId }).whereNull("deleted_at").orderBy("sort_order");
}

export async function insertAcademicTest(userId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("platform_user_academic_tests")
    .insert({ user_id: userId, ...data })
    .returning("*");
  return row;
}

export async function updateAcademicTest(id: string, userId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("platform_user_academic_tests")
    .where({ id, user_id: userId })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function deleteAcademicTest(id: string, userId: number) {
  return masterKnex("platform_user_academic_tests").where({ id, user_id: userId }).update({ deleted_at: masterKnex.fn.now() });
}

// ── Work Experiences ──

export async function listWorkExperiences(userId: number) {
  return masterKnex("platform_user_work_experiences").where({ user_id: userId }).whereNull("deleted_at").orderBy("sort_order");
}

export async function insertWorkExperience(userId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("platform_user_work_experiences")
    .insert({ user_id: userId, ...data })
    .returning("*");
  return row;
}

export async function updateWorkExperience(id: string, userId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("platform_user_work_experiences")
    .where({ id, user_id: userId })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function deleteWorkExperience(id: string, userId: number) {
  return masterKnex("platform_user_work_experiences").where({ id, user_id: userId }).update({ deleted_at: masterKnex.fn.now() });
}

// ── Institutions ──

export async function findInstitutionBySubdomain(subdomain: string) {
  return masterKnex<Record<string, unknown>>("institutions").where({ subdomain }).whereNull("deleted_at").first<Record<string, unknown>>();
}

export async function findInstitutionByUserId(userId: number) {
  return masterKnex<Record<string, unknown>>("institutions").where({ platform_user_id: userId }).whereNull("deleted_at").first<Record<string, unknown>>();
}

export async function insertInstitution(data: Record<string, unknown>) {
  const [row] = await masterKnex("institutions").insert(data).returning("*");
  return row;
}

/** Hard delete — only used to roll back a registration whose schema provisioning failed. */
export async function deleteInstitution(id: number) {
  await masterKnex("institutions").where({ id }).delete();
}

// ── Institution claim (promoted listings) ──
// Mirrors the businesses claim repo. Institutions only need this because promote can now
// create one nobody owns yet.

// ── Institution membership index (master DB) ──
// The institution twin of user_business_index. `members` in the tenant schema stays
// authoritative for role; this exists so login can find a user's institutions without
// scanning every schema.

/**
 * Institutions this user can enter — the same gate listUserBusinesses applies:
 * account_status 1, plus a schema to actually connect to.
 */
export async function listUserInstitutions(platformUserId: number) {
  return masterKnex("user_institution_index")
    .join("institutions", "user_institution_index.institution_id", "institutions.id")
    .where("user_institution_index.platform_user_id", platformUserId)
    .where("institutions.account_status", 1)
    .whereNotNull("institutions.schema_provisioned_at")
    .whereNull("user_institution_index.deleted_at")
    .whereNull("institutions.deleted_at")
    .select(
      "institutions.id",
      "institutions.schema_name as org_id",
      "institutions.institution_name",
      "institutions.subdomain",
      "institutions.logo_url",
      "user_institution_index.role",
      "user_institution_index.is_owner",
    );
}

/** See insertUserBusinessIndex for why the merge clears deleted_at. */
export async function insertUserInstitutionIndex(data: {
  platform_user_id: number;
  institution_id: number;
  role: string;
  is_owner: boolean;
}) {
  await masterKnex("user_institution_index")
    .insert({ ...data, created_at: masterKnex.fn.now() })
    .onConflict(["platform_user_id", "institution_id"])
    .merge({ role: data.role, is_owner: data.is_owner, deleted_at: null });
}

export async function softDeleteUserInstitutionIndex(platformUserId: number, institutionId: number) {
  await masterKnex("user_institution_index")
    .where({ platform_user_id: platformUserId, institution_id: institutionId })
    .whereNull("deleted_at")
    .update({ deleted_at: masterKnex.fn.now() });
}

/** Institution-context equivalent of findBusinessByDbName — used by switch-account. */
export async function findInstitutionBySchemaName(schemaNameUuid: string) {
  return masterKnex("institutions")
    .where({ schema_name: schemaNameUuid, account_status: 1 })
    .whereNotNull("schema_provisioned_at")
    .whereNull("deleted_at")
    .first();
}

export async function findInstitutionByClaimToken(token: string) {
  return masterKnex("institutions").where({ claim_token: token }).whereNull("deleted_at").first();
}

/** The institution a platform_user owns but hasn't finished claiming (promoted, not self-service). */
/** See findUnclaimedBusinessByContactEmail — matched on the institution's own contact email,
 *  because a promoted listing has no owner to match on until it is claimed. */
export async function findUnclaimedInstitutionByContactEmail(email: string) {
  return masterKnex("institutions")
    .whereRaw("lower(email) = lower(?)", [email])
    .whereNot("claim_status", "claimed")
    .whereNull("deleted_at")
    .first();
}

export async function setInstitutionClaimPending(id: number, token: string, expiresAt: Date) {
  await masterKnex("institutions").where({ id }).update({
    claim_token: token,
    claim_token_expires_at: expiresAt,
    claim_status: "claim_pending",
    updated_at: masterKnex.fn.now(),
  });
}

export async function clearInstitutionClaim(id: number) {
  await masterKnex("institutions").where({ id }).update({
    claim_token: null,
    claim_token_expires_at: null,
    claim_status: "claimed",
    updated_at: masterKnex.fn.now(),
  });
}

export async function updateInstitution(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("institutions")
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

// ── Countries / Cities ──

export async function listCountries() {
  return masterKnex("countries")
    .select("id", "name", "iso2", "iso3", "phone_code", "region", "currency", "currency_symbol")
    .where({ is_active: true })
    .whereNull("deleted_at")
    .orderBy("name");
}

export async function findCountryById(id: number) {
  return masterKnex<Record<string, unknown>>("countries").where({ id }).whereNull("deleted_at").first<Record<string, unknown>>();
}

export async function listCitiesByCountry(countryId: number) {
  return masterKnex("cities").select("id", "name", "state_name").where({ country_id: countryId }).whereNull("deleted_at").orderBy("name");
}
