// Student service — registration, profile management, sub-resources (OTP auth handled by unified auth module).

import { ConflictError, NotFoundError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as repo from "../repositories/students.repository.js";
import type {
  StudentRegisterInput, StudentProfilePatchInput,
  QualificationInput, LanguageTestInput, WorkExperienceInput,
} from "../schemas/students.schema.js";

const logger = createChildLogger("students-service");

// ── Registration ──

export async function registerStudent(input: StudentRegisterInput) {
  const existing = await repo.findStudentByEmail(input.email);
  if (existing) throw new ConflictError("Email already registered");

  const student = await repo.insertStudent({
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    username: input.email,
    phone: input.phone,
    account_status: 1,
  });

  await repo.insertProfile(student.id, {
    nationality_id: input.nationality_id ?? null,
    country_of_residence_id: input.country_of_residence_id ?? null,
  });

  logger.info("Student registered", { studentId: student.id });

  return {
    user: { id: student.id, email: student.email, first_name: student.first_name, last_name: student.last_name },
    message: "Student registered. Use OTP login to access your account.",
  };
}

// ── Profile ──

export async function getProfile(studentId: number) {
  const profile = await repo.findProfileByStudentId(studentId);
  if (!profile) throw new NotFoundError("Student profile not found");

  const [qualifications, language_tests, work_experiences] = await Promise.all([
    repo.listQualifications(studentId),
    repo.listLanguageTests(studentId),
    repo.listWorkExperiences(studentId),
  ]);

  return { ...profile, qualifications, language_tests, work_experiences };
}

export async function updateProfile(studentId: number, data: StudentProfilePatchInput) {
  const existing = await repo.findProfileByStudentId(studentId);
  if (!existing) throw new NotFoundError("Student profile not found");
  return repo.updateProfile(studentId, data);
}

// ── Qualifications ──

export async function addQualification(studentId: number, data: QualificationInput) {
  return repo.insertQualification(studentId, data);
}

export async function editQualification(id: string, studentId: number, data: Partial<QualificationInput>) {
  const row = await repo.updateQualification(id, studentId, data);
  if (!row) throw new NotFoundError("Qualification not found");
  return row;
}

export async function removeQualification(id: string, studentId: number) {
  const deleted = await repo.deleteQualification(id, studentId);
  if (!deleted) throw new NotFoundError("Qualification not found");
}

// ── Language Tests ──

export async function addLanguageTest(studentId: number, data: LanguageTestInput) {
  return repo.insertLanguageTest(studentId, data);
}

export async function editLanguageTest(id: string, studentId: number, data: Partial<LanguageTestInput>) {
  const row = await repo.updateLanguageTest(id, studentId, data);
  if (!row) throw new NotFoundError("Language test not found");
  return row;
}

export async function removeLanguageTest(id: string, studentId: number) {
  const deleted = await repo.deleteLanguageTest(id, studentId);
  if (!deleted) throw new NotFoundError("Language test not found");
}

// ── Work Experiences ──

export async function addWorkExperience(studentId: number, data: WorkExperienceInput) {
  return repo.insertWorkExperience(studentId, data);
}

export async function editWorkExperience(id: string, studentId: number, data: Partial<WorkExperienceInput>) {
  const row = await repo.updateWorkExperience(id, studentId, data);
  if (!row) throw new NotFoundError("Work experience not found");
  return row;
}

export async function removeWorkExperience(id: string, studentId: number) {
  const deleted = await repo.deleteWorkExperience(id, studentId);
  if (!deleted) throw new NotFoundError("Work experience not found");
}
