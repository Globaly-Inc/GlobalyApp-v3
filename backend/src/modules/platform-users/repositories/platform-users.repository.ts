// Platform user repository — all queries against globalyapp platform_users / platform_user_profiles / sub-resource tables.

import { masterKnex } from "../../../core/db/master-pool.js";

export interface PlatformUserRow {
  id: number;
  uuid: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  username: string;
  otp: string | null;
  otp_expires_at: Date | null;
  otp_attempts: number;
  otp_locked_until: Date | null;
  refresh_token: string | null;
  refresh_token_family: string | null;
  account_status: number;
  photo_url: string | null;
  is_email_verified: boolean;
  user_category: string | null;
  user_sub_category: string | null;
  meta: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

const SAFE_COLUMNS = [
  "id", "uuid", "first_name", "last_name", "email", "phone", "username",
  "account_status", "photo_url", "is_email_verified",
  "user_category", "user_sub_category",
  "meta", "created_at", "updated_at",
] as const;

// ── User auth ──

export async function findByEmail(email: string) {
  return masterKnex<PlatformUserRow>("platform_users").where({ email }).first() as Promise<PlatformUserRow | undefined>;
}

export async function findById(id: number) {
  return masterKnex("platform_users")
    .select(SAFE_COLUMNS as unknown as string[])
    .where({ id })
    .first() as Promise<PlatformUserRow | undefined>;
}

export async function findByIdFull(id: number) {
  return masterKnex<PlatformUserRow>("platform_users").where({ id }).first<PlatformUserRow>();
}

export async function insert(data: {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  account_status: number;
  phone?: string;
  user_category?: string;
  user_sub_category?: string;
}) {
  const [row] = await masterKnex<PlatformUserRow>("platform_users")
    .insert({ ...data, created_at: masterKnex.fn.now(), updated_at: masterKnex.fn.now() })
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

export async function updateOtp(userId: number, otp: string, expiresAt: Date) {
  await masterKnex("platform_users")
    .where({ id: userId })
    .update({ otp, otp_expires_at: expiresAt, otp_attempts: 0, otp_locked_until: null, updated_at: masterKnex.fn.now() });
}

export async function clearOtp(userId: number) {
  await masterKnex("platform_users")
    .where({ id: userId })
    .update({ otp: null, otp_expires_at: null, otp_attempts: 0, otp_locked_until: null, updated_at: masterKnex.fn.now() });
}

export async function incrementOtpAttempts(userId: number, attempts: number) {
  await masterKnex("platform_users")
    .where({ id: userId })
    .update({ otp_attempts: attempts, updated_at: masterKnex.fn.now() });
}

export async function lockOtp(userId: number, attempts: number, lockedUntil: Date) {
  await masterKnex("platform_users")
    .where({ id: userId })
    .update({ otp_attempts: attempts, otp_locked_until: lockedUntil, updated_at: masterKnex.fn.now() });
}

export async function updateRefreshToken(userId: number, token: string | null, family?: string | null) {
  const update: Record<string, unknown> = { refresh_token: token, updated_at: masterKnex.fn.now() };
  if (family !== undefined) update.refresh_token_family = family;
  await masterKnex("platform_users")
    .where({ id: userId })
    .update(update);
}

export async function findByRefreshToken(token: string) {
  return masterKnex<PlatformUserRow>("platform_users")
    .where({ refresh_token: token })
    .first<PlatformUserRow>();
}

// ── Business Index (master DB) ──

export async function listUserBusinesses(platformUserId: number) {
  return masterKnex("user_business_index")
    .join("businesses", "user_business_index.business_id", "businesses.id")
    .where("user_business_index.platform_user_id", platformUserId)
    .where("businesses.account_status", 1)
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

export async function insertUserBusinessIndex(data: {
  platform_user_id: number;
  business_id: number;
  role: string;
  is_owner: boolean;
}) {
  await masterKnex("user_business_index")
    .insert({ ...data, created_at: masterKnex.fn.now() })
    .onConflict(["platform_user_id", "business_id"])
    .merge({ role: data.role, is_owner: data.is_owner });
}

export async function findBusinessByDbName(dbName: string) {
  return masterKnex("businesses")
    .where({ schema_name: dbName, account_status: 1 })
    .first();
}

// ── Profile ──

export async function findProfileByUserId(userId: number) {
  return masterKnex<Record<string, unknown>>("platform_user_profiles").where({ user_id: userId }).first<Record<string, unknown>>();
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
  return masterKnex("platform_user_qualifications").where({ user_id: userId }).orderBy("sort_order");
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
  return masterKnex("platform_user_qualifications").where({ id, user_id: userId }).delete();
}

// ── Language Tests ──

export async function listLanguageTests(userId: number) {
  return masterKnex("platform_user_language_tests").where({ user_id: userId }).orderBy("sort_order");
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
  return masterKnex("platform_user_language_tests").where({ id, user_id: userId }).delete();
}

// ── Work Experiences ──

export async function listWorkExperiences(userId: number) {
  return masterKnex("platform_user_work_experiences").where({ user_id: userId }).orderBy("sort_order");
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
  return masterKnex("platform_user_work_experiences").where({ id, user_id: userId }).delete();
}

// ── Institutions ──

export async function findInstitutionBySubdomain(subdomain: string) {
  return masterKnex<Record<string, unknown>>("institutions").where({ subdomain }).first<Record<string, unknown>>();
}

export async function findInstitutionByUserId(userId: number) {
  return masterKnex<Record<string, unknown>>("institutions").where({ platform_user_id: userId }).first<Record<string, unknown>>();
}

export async function insertInstitution(data: Record<string, unknown>) {
  const [row] = await masterKnex("institutions").insert(data).returning("*");
  return row;
}

// ── Countries / Cities ──

export async function listCountries() {
  return masterKnex("countries").select("id", "name", "iso2", "iso3", "phone_code", "region").where({ is_active: true }).orderBy("name");
}

export async function findCountryById(id: number) {
  return masterKnex<Record<string, unknown>>("countries").where({ id }).first<Record<string, unknown>>();
}

export async function listCitiesByCountry(countryId: number) {
  return masterKnex("cities").select("id", "name", "state_name").where({ country_id: countryId }).orderBy("name");
}
