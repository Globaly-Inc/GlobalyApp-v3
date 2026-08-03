// Student repository — all queries against globalyapp students / student_profiles / sub-resource tables.

import { masterKnex } from "../../../core/db/master-pool.js";

export interface StudentRow {
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
  meta: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

const SAFE_COLUMNS = [
  "id",
  "uuid",
  "first_name",
  "last_name",
  "email",
  "phone",
  "username",
  "account_status",
  "photo_url",
  "is_email_verified",
  "meta",
  "created_at",
  "updated_at",
] as const;

// ── Student auth ──

export async function findStudentByEmail(email: string) {
  return masterKnex<StudentRow>("students").where({ email }).first();
}

export async function findStudentById(id: number) {
  return masterKnex<StudentRow>("students")
    .select(SAFE_COLUMNS as unknown as string[])
    .where({ id })
    .first();
}

export async function findStudentByIdFull(id: number) {
  return masterKnex<StudentRow>("students").where({ id }).first();
}

export async function insertStudent(data: {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  account_status: number;
  phone?: string;
}) {
  const [row] = await masterKnex<StudentRow>("students")
    .insert({ ...data, created_at: masterKnex.fn.now(), updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function updateOtp(studentId: number, otp: string, expiresAt: Date) {
  await masterKnex("students")
    .where({ id: studentId })
    .update({ otp, otp_expires_at: expiresAt, updated_at: masterKnex.fn.now() });
}

export async function clearOtp(studentId: number) {
  await masterKnex("students")
    .where({ id: studentId })
    .update({ otp: null, otp_expires_at: null, updated_at: masterKnex.fn.now() });
}

export async function updateRefreshToken(studentId: number, token: string | null) {
  await masterKnex("students")
    .where({ id: studentId })
    .update({ refresh_token: token, updated_at: masterKnex.fn.now() });
}

export async function findStudentByRefreshToken(token: string) {
  return masterKnex<StudentRow>("students")
    .where({ refresh_token: token })
    .first();
}

// ── Profile ──

export async function findProfileByStudentId(studentId: number) {
  return masterKnex("student_profiles").where({ student_id: studentId }).first();
}

export async function insertProfile(studentId: number, data: Record<string, unknown> = {}) {
  const [row] = await masterKnex("student_profiles")
    .insert({ student_id: studentId, ...data })
    .returning("*");
  return row;
}

export async function updateProfile(studentId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("student_profiles")
    .where({ student_id: studentId })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

// ── Qualifications ──

export async function listQualifications(studentId: number) {
  return masterKnex("student_qualifications").where({ student_id: studentId }).orderBy("sort_order");
}

export async function insertQualification(studentId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("student_qualifications")
    .insert({ student_id: studentId, ...data })
    .returning("*");
  return row;
}

export async function updateQualification(id: string, studentId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("student_qualifications")
    .where({ id, student_id: studentId })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function deleteQualification(id: string, studentId: number) {
  return masterKnex("student_qualifications").where({ id, student_id: studentId }).delete();
}

// ── Language Tests ──

export async function listLanguageTests(studentId: number) {
  return masterKnex("student_language_tests").where({ student_id: studentId }).orderBy("sort_order");
}

export async function insertLanguageTest(studentId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("student_language_tests")
    .insert({ student_id: studentId, ...data })
    .returning("*");
  return row;
}

export async function updateLanguageTest(id: string, studentId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("student_language_tests")
    .where({ id, student_id: studentId })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function deleteLanguageTest(id: string, studentId: number) {
  return masterKnex("student_language_tests").where({ id, student_id: studentId }).delete();
}

// ── Work Experiences ──

export async function listWorkExperiences(studentId: number) {
  return masterKnex("student_work_experiences").where({ student_id: studentId }).orderBy("sort_order");
}

export async function insertWorkExperience(studentId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("student_work_experiences")
    .insert({ student_id: studentId, ...data })
    .returning("*");
  return row;
}

export async function updateWorkExperience(id: string, studentId: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("student_work_experiences")
    .where({ id, student_id: studentId })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function deleteWorkExperience(id: string, studentId: number) {
  return masterKnex("student_work_experiences").where({ id, student_id: studentId }).delete();
}
