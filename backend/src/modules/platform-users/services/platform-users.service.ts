// Platform user service — profile management and sub-resources (registration + OTP auth handled by auth module).

import { NotFoundError, ConflictError, BadRequestError } from "../../../shared/errors.js";
import { config } from "../../../config.js";
import { generateSubdomain } from "../../../shared/subdomain.js";
import * as storage from "../../../shared/storage/storageService.js";
import { computeCompletion, syncCompletion } from "./completion.js";
import * as repo from "../repositories/platform-users.repository.js";
import * as bizRepo from "../../businesses/repositories/businesses.repository.js";
import { registerBusiness } from "../../businesses/services/businesses.service.js";
import { issueScopedAccessToken } from "../../auth/auth.service.js";
import * as institutionMembers from "./institution-members.service.js";
import { provisionInstitutionSchema } from "../../../core/business/provisioner.js";
import { getKnex } from "../../../core/db/pool-manager.js";
import { schemaName } from "../../../core/db/knex.js";
import * as categoriesService from "../../superadmin/platform/categories/services/categories.service.js";
import { createSystemPost } from "../../feed/services/feed.service.js";
import { createChildLogger } from "../../../shared/logger.js";
import type {
  ProfilePatchInput,
  OnboardingPersonalInput, OnboardingBusinessInput, OnboardingInstitutionInput,
  QualificationInput, LanguageTestInput, AcademicTestInput, WorkExperienceInput,
} from "../schemas/platform-users.schema.js";

const logger = createChildLogger("platform-users-service");
const WELCOME_POST_IMAGE = `${config.WEB_APP_URL}/welcome-post.png`;

// ── Profile ──

export async function getProfile(userId: number) {
  const user = await repo.findById(userId);
  if (!user) throw new NotFoundError("User not found");

  const profile = await repo.findProfileByUserId(userId);

  const [qualifications, language_tests, academic_tests, work_experiences] = await Promise.all([
    repo.listQualifications(userId),
    repo.listLanguageTests(userId),
    repo.listAcademicTests(userId),
    repo.listWorkExperiences(userId),
  ]);

  let user_category: "business" | "institution" | "personal" | null = null;
  if (user.is_business_account) user_category = "business";
  else if (user.is_institution_account) user_category = "institution";
  else if (user.is_personal_account) user_category = "personal";

  const [photo_url, cover_url] = await Promise.all([
    storage.resolvePreviewUrl(user.photo_url),
    storage.resolvePreviewUrl(user.cover_url),
  ]);

  const completion = computeCompletion(user, profile ?? null, qualifications.length, language_tests.length);

  return { ...user, photo_url, cover_url, user_category, profile: profile ?? null, qualifications, language_tests, academic_tests, work_experiences, completion };
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

  // Nationality and country of residence are completion criteria.
  await syncCompletion(userId);
  return getProfile(userId);
}

/** Business onboarding — delegates to businesses service (provisions tenant DB). */
export async function onboardBusiness(userId: number, data: OnboardingBusinessInput) {
  return registerBusiness(userId, {
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

/** Institution onboarding — inserts into institutions table, provisions tenant schema (members, member_invitations). */
export async function onboardInstitution(userId: number, data: OnboardingInstitutionInput) {
  const user = await repo.findByIdFull(userId);
  if (!user) throw new NotFoundError("User not found");

  // Auto-generate subdomain from institution name, unique across businesses + institutions.
  const subdomain = await generateSubdomain(data.institution_name, async (candidate) => {
    const [inst, biz] = await Promise.all([
      repo.findInstitutionBySubdomain(candidate),
      bizRepo.findBusinessBySubdomain(candidate),
    ]);
    return Boolean(inst || biz);
  });

  const institution = await repo.insertInstitution({
    platform_user_id: userId,
    first_name: user.first_name,
    last_name: user.last_name,
    email: data.email ?? user.email,
    phone: data.phone,
    subdomain,
    institution_name: data.institution_name,
    institution_type: data.institution_type,
    country_id: data.country_id,
    state: data.state,
    city: data.city,
    address: data.address,
    postcode: data.postcode,
    claim_status: "claimed",
  });

  try {
    await provisionInstitutionSchema(institution.schema_name);
  } catch (err) {
    await repo.deleteInstitution(institution.id);
    throw err;
  }

  // Create the owner member. addMember writes BOTH the tenant `members` row and
  // user_institution_index — see institution-members.service.ts for why they must move
  // together. Pool key is the schema UUID: institution ids would collide with business ids.
  const db = await getKnex(institution.schema_name, schemaName(institution.schema_name));
  await institutionMembers.addMember(db, Number(institution.id), {
    platform_user_id: userId,
    role: "owner",
    is_owner: true,
    first_name: user.first_name,
    last_name: user.last_name,
    email: data.email ?? user.email,
    phone: data.phone,
  });

  await repo.updateUser(userId, { is_institution_account: true });
  await repo.addAccountCategory(userId, { type: "institution", role: institution.institution_type ?? "institution" });

  // Last, as registerBusiness does with its own account_status: 1 is what makes the
  // institution resolvable by findInstitutionBySchemaName and listUserInstitutions, so it must
  // not flip until the schema and the owner member exist. Without it the scoped token below
  // would be handed out for an institution the tenant plugin then refuses to resolve.
  await repo.updateInstitution(institution.id, { account_status: 1 });

  createSystemPost({
    authorId: userId,
    institutionId: Number(institution.id),
    content: `**@all** 🎉 We've just joined **GlobalyApp**! Excited to be part of the community.`,
    // Always the landscape banner, never the institution's own logo: a square logo forced into
    // the feed's wide image box gets center-cropped into an unrecognisable zoom.
    media: [
      {
        storage_path: WELCOME_POST_IMAGE,
        type: "image",
        mime_type: "image/png",
      },
    ],
  }).catch((err) => logger.warn("Welcome post creation error", { institutionId: institution.id, err: err.message }));

  // Scoped token, as registerBusiness does — otherwise the user has just created an
  // institution and still has to log out and back in to enter it.
  const access_token = issueScopedAccessToken({ id: userId, email: user.email }, institution.schema_name, "owner", "institution");

  return {
    institution: { id: institution.id, org_id: institution.schema_name, subdomain: institution.subdomain, institution_name: institution.institution_name },
    access_token,
    message: "Institution registered.",
  };
}

export async function updateProfile(userId: number, data: ProfilePatchInput) {
  const { first_name, last_name, phone, ...profileFields } = data;
  const userFields: Record<string, unknown> = {};
  if (first_name !== undefined) userFields.first_name = first_name;
  if (last_name !== undefined) userFields.last_name = last_name;
  if (phone !== undefined) userFields.phone = phone;
  if (Object.keys(userFields).length > 0) await repo.updateUser(userId, userFields);

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
  if (profileFields.public_visibility !== undefined) {
    serialized.public_visibility = JSON.stringify(profileFields.public_visibility);
  }

  const existing = await repo.findProfileByUserId(userId);
  if (existing) {
    await repo.updateProfile(userId, serialized);
  } else {
    await repo.insertProfile(userId, serialized);
  }

  await syncCompletion(userId);
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

// ── Lookups (degree levels, areas of study) ──
// Personal-account counterpart to the business module's /businesses/degree-levels and
// /areas-of-study — same underlying tables, but reachable without a business context.

export async function listDegreeLevels(limit: number, offset: number, search?: string) {
  const [rows, total] = await Promise.all([
    categoriesService.listLookup("degree_levels", limit, offset, search),
    categoriesService.countLookup("degree_levels", search),
  ]);
  return { rows, total };
}

export async function listAreasOfStudy(limit: number, offset: number, search?: string) {
  const [rows, total] = await Promise.all([
    categoriesService.listLookup("areas_of_study", limit, offset, search),
    categoriesService.countLookup("areas_of_study", search),
  ]);
  return { rows, total };
}

// ── Qualifications ──
// These three change the "Education background" completion criterion, so each syncs. Work
// experiences deliberately do NOT: they are not one of the 8 criteria, so a sync there would be a
// dead call.

export async function addQualification(userId: number, data: QualificationInput) {
  const row = await repo.insertQualification(userId, data);
  await syncCompletion(userId);
  return row;
}

export async function editQualification(id: string, userId: number, data: Partial<QualificationInput>) {
  const row = await repo.updateQualification(id, userId, data);
  if (!row) throw new NotFoundError("Qualification not found");
  await syncCompletion(userId);
  return row;
}

export async function removeQualification(id: string, userId: number) {
  const deleted = await repo.deleteQualification(id, userId);
  if (!deleted) throw new NotFoundError("Qualification not found");
  await syncCompletion(userId);
}

// ── Language Tests ──
// These three change the "Test scores" criterion.

export async function addLanguageTest(userId: number, data: LanguageTestInput) {
  const row = await repo.insertLanguageTest(userId, data);
  await syncCompletion(userId);
  return row;
}

export async function editLanguageTest(id: string, userId: number, data: Partial<LanguageTestInput>) {
  const row = await repo.updateLanguageTest(id, userId, data);
  if (!row) throw new NotFoundError("Language test not found");
  await syncCompletion(userId);
  return row;
}

export async function removeLanguageTest(id: string, userId: number) {
  const deleted = await repo.deleteLanguageTest(id, userId);
  if (!deleted) throw new NotFoundError("Language test not found");
  await syncCompletion(userId);
}

// ── Academic Tests ──
// Not a completion criterion (same as work experience), so no syncCompletion here.

export async function addAcademicTest(userId: number, data: AcademicTestInput) {
  return repo.insertAcademicTest(userId, data);
}

export async function editAcademicTest(id: string, userId: number, data: Partial<AcademicTestInput>) {
  const row = await repo.updateAcademicTest(id, userId, data);
  if (!row) throw new NotFoundError("Academic test not found");
  return row;
}

export async function removeAcademicTest(id: string, userId: number) {
  const deleted = await repo.deleteAcademicTest(id, userId);
  if (!deleted) throw new NotFoundError("Academic test not found");
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
