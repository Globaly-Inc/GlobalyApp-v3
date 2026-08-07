import { httpDelete, httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type {
  FullProfile,
  LanguageTest,
  LanguageTestInput,
  Qualification,
  QualificationInput,
  StudentProfile,
  StudentProfilePatch,
  UpdateSubCategoryParams,
  WorkExperience,
  WorkExperienceInput,
} from "./types";

type PlatformUserMeResponse = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  photo_url: string | null;
  user_category: string | null;
  user_sub_category: string | null;
  profile: {
    nationality_id: number | null;
    country_of_residence_id: number | null;
    city_of_residence: string | null;
    date_of_birth: string | null;
    gender: string | null;
    personal_address_country_id: number | null;
    personal_address_city: string | null;
    personal_address_state: string | null;
    personal_address_street: string | null;
    personal_address_postcode: string | null;
    budget_min: number | null;
    budget_max: number | null;
    budget_currency: string | null;
    include_living_expenses: boolean;
    preferred_destinations: number[] | null;
    fields_of_study: { name: string }[] | null;
    preferred_degree_levels: string[] | null;
    expected_start_date: string | null;
    linkedin_url: string | null;
    website_url: string | null;
    onboarding_completed: boolean;
  } | null;
  qualifications: Qualification[];
  language_tests: LanguageTest[];
  work_experiences: WorkExperience[];
};

function toStudentProfile(raw: PlatformUserMeResponse): StudentProfile {
  const profile = raw.profile;
  return {
    first_name: raw.first_name,
    last_name: raw.last_name,
    email: raw.email,
    phone: raw.phone,
    photo_url: raw.photo_url,
    user_category: raw.user_category,
    user_sub_category: raw.user_sub_category,
    nationality_id: profile?.nationality_id ?? null,
    country_of_residence_id: profile?.country_of_residence_id ?? null,
    city_of_residence: profile?.city_of_residence ?? null,
    date_of_birth: profile?.date_of_birth ?? null,
    gender: profile?.gender ?? null,
    personal_address_country_id: profile?.personal_address_country_id ?? null,
    personal_address_city: profile?.personal_address_city ?? null,
    personal_address_state: profile?.personal_address_state ?? null,
    personal_address_street: profile?.personal_address_street ?? null,
    personal_address_postcode: profile?.personal_address_postcode ?? null,
    budget_min: profile?.budget_min ?? null,
    budget_max: profile?.budget_max ?? null,
    budget_currency: profile?.budget_currency ?? null,
    include_living_expenses: profile?.include_living_expenses ?? false,
    preferred_destinations: profile?.preferred_destinations ?? null,
    preferred_fields: profile?.fields_of_study?.map((f) => f.name) ?? null,
    preferred_degree_levels: profile?.preferred_degree_levels ?? null,
    expected_start_date: profile?.expected_start_date ?? null,
    linkedin_url: profile?.linkedin_url ?? null,
    website_url: profile?.website_url ?? null,
    onboarding_completed: profile?.onboarding_completed ?? false,
  };
}

function fetchMe(): Promise<PlatformUserMeResponse> {
  return httpGet("/platform-users/me");
}

function patchBody(patch: StudentProfilePatch): Record<string, unknown> {
  const { preferred_fields, ...rest } = patch;
  const body: Record<string, unknown> = { ...rest };
  if (preferred_fields !== undefined) {
    body.fields_of_study = preferred_fields?.map((name) => ({ name })) ?? null;
  }
  return body;
}

export const personalRealApi = {
  getMyProfile: async (): Promise<StudentProfile> => toStudentProfile(await fetchMe()),

  updateMyProfile: async (patch: StudentProfilePatch): Promise<StudentProfile> =>
    toStudentProfile(await httpPatch("/platform-users/me", patchBody(patch))),

  updateSubCategory: (params: UpdateSubCategoryParams): Promise<void> =>
    httpPatch("/platform-users/me/sub-category", params),

  getFullProfile: async (): Promise<FullProfile> => {
    const raw = await fetchMe();
    return {
      profile: toStudentProfile(raw),
      qualifications: raw.qualifications,
      languageTests: raw.language_tests,
      workExperiences: raw.work_experiences,
    };
  },

  addQualification: (input: QualificationInput): Promise<Qualification> =>
    httpPost("/platform-users/me/qualifications", input),
  updateQualification: (id: string, patch: Partial<QualificationInput>): Promise<Qualification> =>
    httpPatch(`/platform-users/me/qualifications/${id}`, patch),
  removeQualification: (id: string): Promise<void> => httpDelete(`/platform-users/me/qualifications/${id}`),

  addLanguageTest: (input: LanguageTestInput): Promise<LanguageTest> =>
    httpPost("/platform-users/me/language-tests", input),
  updateLanguageTest: (id: string, patch: Partial<LanguageTestInput>): Promise<LanguageTest> =>
    httpPatch(`/platform-users/me/language-tests/${id}`, patch),
  removeLanguageTest: (id: string): Promise<void> => httpDelete(`/platform-users/me/language-tests/${id}`),

  addWorkExperience: (input: WorkExperienceInput): Promise<WorkExperience> =>
    httpPost("/platform-users/me/work-experiences", input),
  updateWorkExperience: (id: string, patch: Partial<WorkExperienceInput>): Promise<WorkExperience> =>
    httpPatch(`/platform-users/me/work-experiences/${id}`, patch),
  removeWorkExperience: (id: string): Promise<void> => httpDelete(`/platform-users/me/work-experiences/${id}`),
};
