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
  refresh_token: string | null;
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
    .update({ otp, otp_expires_at: expiresAt, updated_at: masterKnex.fn.now() });
}

export async function clearOtp(userId: number) {
  await masterKnex("platform_users")
    .where({ id: userId })
    .update({ otp: null, otp_expires_at: null, updated_at: masterKnex.fn.now() });
}

export async function updateRefreshToken(userId: number, token: string | null) {
  await masterKnex("platform_users")
    .where({ id: userId })
    .update({ refresh_token: token, updated_at: masterKnex.fn.now() });
}

export async function findByRefreshToken(token: string) {
  return masterKnex<PlatformUserRow>("platform_users")
    .where({ refresh_token: token })
    .first<PlatformUserRow>();
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
