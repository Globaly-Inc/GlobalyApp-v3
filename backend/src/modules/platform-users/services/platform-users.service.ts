// Platform user service — profile management and sub-resources (registration + OTP auth handled by auth module).

import { NotFoundError, ConflictError, BadRequestError } from "../../../shared/errors.js";
import * as storage from "../../../shared/storage/storageService.js";
import * as repo from "../repositories/platform-users.repository.js";
import * as bizRepo from "../../businesses/repositories/businesses.repository.js";
import { registerBusiness } from "../../businesses/services/businesses.service.js";
import type {
  ProfilePatchInput,
  OnboardingPersonalInput, OnboardingBusinessInput, OnboardingInstitutionInput,
  QualificationInput, LanguageTestInput, WorkExperienceInput,
} from "../schemas/platform-users.schema.js";

// ── Profile ──

export async function getProfile(userId: number) {
  const user = await repo.findById(userId);
  if (!user) throw new NotFoundError("User not found");

  const profile = await repo.findProfileByUserId(userId);

  const [qualifications, language_tests, work_experiences] = await Promise.all([
    repo.listQualifications(userId),
    repo.listLanguageTests(userId),
    repo.listWorkExperiences(userId),
  ]);

  let user_category: "business" | "personal" | null = null;
  if (user.is_business_account) user_category = "business";
  else if (user.is_personal_account) user_category = "personal";

  const [photo_url, cover_url] = await Promise.all([
    storage.resolvePreviewUrl(user.photo_url),
    storage.resolvePreviewUrl(user.cover_url),
  ]);

  return { ...user, photo_url, cover_url, user_category, profile: profile ?? null, qualifications, language_tests, work_experiences };
}

/** Sets which portal the user lands in — flips is_personal_account / is_business_account. */
export async function updateCategory(userId: number, category: "personal" | "business") {
  const user = await repo.findById(userId);
  if (!user) throw new NotFoundError("User not found");

  await repo.updateUser(userId, {
    is_personal_account: category === "personal" ? true : user.is_personal_account,
    is_business_account: category === "business" ? true : user.is_business_account,
  });

  return getProfile(userId);
}

/** Personal onboarding — sets individual_category on profile + flips is_personal_account flag. */
export async function onboardPersonal(userId: number, data: OnboardingPersonalInput) {
  const user = await repo.findById(userId);
  if (!user) throw new NotFoundError("User not found");

  const profileData: Record<string, unknown> = {
    individual_category: data.individual_category,
    nationality_id: data.nationality_id,
    country_of_residence_id: data.country_of_residence_id,
    city_of_residence: data.city_of_residence,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    date_of_birth: data.date_of_birth,
    gender: data.gender,
    degree_level: data.degree_level,
  };

  const existing = await repo.findProfileByUserId(userId);
  if (existing) {
    await repo.updateProfile(userId, profileData);
  } else {
    await repo.insertProfile(userId, profileData);
  }

  await repo.updateUser(userId, { is_personal_account: true });
  await repo.addAccountCategory(userId, { type: "personal", role: data.individual_category });

  return getProfile(userId);
}

/** Business onboarding — delegates to businesses service (provisions tenant DB). */
export async function onboardBusiness(userId: number, data: OnboardingBusinessInput) {
  return registerBusiness(userId, {
    subdomain: data.subdomain,
    business_name: data.business_name,
    business_type: data.business_type,
    phone: data.phone,
    country_id: data.country_id,
    state: data.state,
    city: data.city,
    address: data.address,
    postcode: data.postcode,
  });
}

/** Institution onboarding — inserts into institutions table, no tenant DB. */
export async function onboardInstitution(userId: number, data: OnboardingInstitutionInput) {
  // Subdomain must be unique across both businesses and institutions
  const [existingInst, existingBiz] = await Promise.all([
    repo.findInstitutionBySubdomain(data.subdomain),
    bizRepo.findBusinessBySubdomain(data.subdomain),
  ]);
  if (existingInst || existingBiz) throw new ConflictError("Subdomain already taken");

  const user = await repo.findByIdFull(userId);
  if (!user) throw new NotFoundError("User not found");

  const institution = await repo.insertInstitution({
    platform_user_id: userId,
    first_name: user.first_name,
    last_name: user.last_name,
    email: data.email ?? user.email,
    phone: data.phone,
    subdomain: data.subdomain,
    institution_name: data.institution_name,
    institution_type: data.institution_type,
    country_id: data.country_id,
    state: data.state,
    city: data.city,
    address: data.address,
    postcode: data.postcode,
  });

  return {
    institution: { id: institution.id, subdomain: institution.subdomain, institution_name: institution.institution_name },
    message: "Institution registered.",
  };
}

export async function updateProfile(userId: number, data: ProfilePatchInput) {
  const { phone, ...profileFields } = data;
  if (phone !== undefined) await repo.updateUser(userId, { phone });

  // Update or auto-create profile
  const hasProfileData = Object.keys(profileFields).length > 0;
  if (!hasProfileData) return getProfile(userId);

  // Serialize jsonb fields
  const serialized: Record<string, unknown> = { ...profileFields };
  if (profileFields.preferred_destinations !== undefined) {
    serialized.preferred_destinations = JSON.stringify(profileFields.preferred_destinations);
  }
  if (profileFields.fields_of_study !== undefined) {
    serialized.fields_of_study = JSON.stringify(profileFields.fields_of_study);
  }

  const existing = await repo.findProfileByUserId(userId);
  if (existing) {
    await repo.updateProfile(userId, serialized);
  } else {
    await repo.insertProfile(userId, serialized);
  }

  return getProfile(userId);
}

// ── Countries / Cities ──

export async function listCountries() {
  return repo.listCountries();
}

export async function getCitiesByCountry(countryId: number) {
  const country = await repo.findCountryById(countryId);
  if (!country) throw new NotFoundError("Country not found");
  const cities = await repo.listCitiesByCountry(countryId);
  return { country_id: countryId, country_name: country.name, cities };
}

// ── Qualifications ──

export async function addQualification(userId: number, data: QualificationInput) {
  return repo.insertQualification(userId, data);
}

export async function editQualification(id: string, userId: number, data: Partial<QualificationInput>) {
  const row = await repo.updateQualification(id, userId, data);
  if (!row) throw new NotFoundError("Qualification not found");
  return row;
}

export async function removeQualification(id: string, userId: number) {
  const deleted = await repo.deleteQualification(id, userId);
  if (!deleted) throw new NotFoundError("Qualification not found");
}

// ── Language Tests ──

export async function addLanguageTest(userId: number, data: LanguageTestInput) {
  return repo.insertLanguageTest(userId, data);
}

export async function editLanguageTest(id: string, userId: number, data: Partial<LanguageTestInput>) {
  const row = await repo.updateLanguageTest(id, userId, data);
  if (!row) throw new NotFoundError("Language test not found");
  return row;
}

export async function removeLanguageTest(id: string, userId: number) {
  const deleted = await repo.deleteLanguageTest(id, userId);
  if (!deleted) throw new NotFoundError("Language test not found");
}

// ── Work Experiences ──

export async function addWorkExperience(userId: number, data: WorkExperienceInput) {
  return repo.insertWorkExperience(userId, data);
}

export async function editWorkExperience(id: string, userId: number, data: Partial<WorkExperienceInput>) {
  const row = await repo.updateWorkExperience(id, userId, data);
  if (!row) throw new NotFoundError("Work experience not found");
  return row;
}

export async function removeWorkExperience(id: string, userId: number) {
  const deleted = await repo.deleteWorkExperience(id, userId);
  if (!deleted) throw new NotFoundError("Work experience not found");
}
