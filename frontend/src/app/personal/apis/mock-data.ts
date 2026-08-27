import { uuid } from "@/lib/utils";
import type { Lookup, Paginated, SearchListParams } from "@/app/admin/platform/categories/apis/types";
import { SEEDED_TESTS } from "@/lib/tests-catalog";
import type { PlatformTest } from "@/lib/tests-catalog";
import { DEGREE_LEVELS, FIELDS_OF_STUDY } from "../static/onboarding-content";
import type {
  AcademicTest,
  AcademicTestInput,
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockDegreeLevels: Lookup[] = DEGREE_LEVELS.map((d, i) => ({ id: i + 1, slug: d.value, name: d.label, sort_order: i, is_active: true }));
const mockAreasOfStudy: Lookup[] = FIELDS_OF_STUDY.map((f, i) => ({ id: i + 1, slug: f, name: f, sort_order: i, is_active: true }));

function filterLookup(rows: Lookup[], params: SearchListParams): Paginated<Lookup> {
  const search = params.search?.toLowerCase();
  const data = search ? rows.filter((r) => r.name.toLowerCase().includes(search)) : rows;
  return { data, meta: { page: 1, limit: data.length, total: data.length, totalPages: 1 } };
}

let mockProfile: StudentProfile = {
  first_name: "Test",
  last_name: "Student",
  email: "test.student@example.com",
  phone: null,
  photo_url: null,
  cover_url: null,
  user_category: "personal",
  user_sub_category: "student",
  nationality_id: null,
  country_of_residence_id: null,
  city_of_residence: null,
  date_of_birth: null,
  gender: null,
  personal_address_country_id: null,
  personal_address_city: null,
  personal_address_state: null,
  personal_address_street: null,
  personal_address_postcode: null,
  latitude: null,
  longitude: null,
  budget_min: null,
  budget_max: null,
  budget_currency: null,
  include_living_expenses: false,
  preferred_destinations: null,
  preferred_fields: null,
  preferred_degree_levels: null,
  expected_start_date: null,
  linkedin_url: null,
  website_url: null,
  onboarding_completed: false,
  public_visibility: null,
  completion: {
    percentage: 25,
    items: [
      { label: "Full name", met: true },
      { label: "Profile photo", met: true },
      { label: "Nationality", met: false },
      { label: "Country of residence", met: false },
      { label: "Education background", met: false },
      { label: "Test scores", met: false },
      { label: "Budget range", met: false },
      { label: "Preferred destinations", met: false },
    ],
  },
};

let mockQualifications: Qualification[] = [];
let mockLanguageTests: LanguageTest[] = [];
let mockAcademicTests: AcademicTest[] = [];
let mockWorkExperiences: WorkExperience[] = [];

export const personalMockApi = {
  getMyProfile: async (): Promise<StudentProfile> => {
    console.log("[mock] GET /platform-users/me");
    await delay(300);
    return mockProfile;
  },

  updateMyProfile: async (patch: StudentProfilePatch): Promise<StudentProfile> => {
    console.log("[mock] PATCH /platform-users/me", patch);
    await delay(300);
    mockProfile = { ...mockProfile, ...patch };
    return mockProfile;
  },

  updateSubCategory: async (params: UpdateSubCategoryParams): Promise<void> => {
    console.log("[mock] PATCH /platform-users/me/sub-category", params);
    await delay(300);
  },

  uploadImage: async (category: "profile" | "cover", file: File): Promise<{ storage_path: string }> => {
    console.log(`[mock] POST /platform-users/me/files?category=${category}`, file.name);
    await delay(400);
    const url = URL.createObjectURL(file);
    mockProfile = { ...mockProfile, [category === "profile" ? "photo_url" : "cover_url"]: url };
    return { storage_path: url };
  },

  getFullProfile: async (): Promise<FullProfile> => {
    console.log("[mock] GET /platform-users/me (full)");
    await delay(300);
    return {
      profile: mockProfile,
      qualifications: mockQualifications,
      languageTests: mockLanguageTests,
      academicTests: mockAcademicTests,
      workExperiences: mockWorkExperiences,
    };
  },

  addQualification: async (input: QualificationInput): Promise<Qualification> => {
    await delay(200);
    const item: Qualification = { ...input, id: uuid() };
    mockQualifications = [...mockQualifications, item];
    return item;
  },
  updateQualification: async (id: string, patch: Partial<QualificationInput>): Promise<Qualification> => {
    await delay(200);
    const item = { ...mockQualifications.find((q) => q.id === id), ...patch, id } as Qualification;
    mockQualifications = mockQualifications.map((q) => (q.id === id ? item : q));
    return item;
  },
  removeQualification: async (id: string): Promise<void> => {
    await delay(200);
    mockQualifications = mockQualifications.filter((q) => q.id !== id);
  },

  addLanguageTest: async (input: LanguageTestInput): Promise<LanguageTest> => {
    await delay(200);
    const item: LanguageTest = { ...input, id: uuid() };
    mockLanguageTests = [...mockLanguageTests, item];
    return item;
  },
  updateLanguageTest: async (id: string, patch: Partial<LanguageTestInput>): Promise<LanguageTest> => {
    await delay(200);
    const item = { ...mockLanguageTests.find((t) => t.id === id), ...patch, id } as LanguageTest;
    mockLanguageTests = mockLanguageTests.map((t) => (t.id === id ? item : t));
    return item;
  },
  removeLanguageTest: async (id: string): Promise<void> => {
    await delay(200);
    mockLanguageTests = mockLanguageTests.filter((t) => t.id !== id);
  },

  addAcademicTest: async (input: AcademicTestInput): Promise<AcademicTest> => {
    await delay(200);
    const item: AcademicTest = { ...input, id: uuid() };
    mockAcademicTests = [...mockAcademicTests, item];
    return item;
  },
  updateAcademicTest: async (id: string, patch: Partial<AcademicTestInput>): Promise<AcademicTest> => {
    await delay(200);
    const item = { ...mockAcademicTests.find((t) => t.id === id), ...patch, id } as AcademicTest;
    mockAcademicTests = mockAcademicTests.map((t) => (t.id === id ? item : t));
    return item;
  },
  removeAcademicTest: async (id: string): Promise<void> => {
    await delay(200);
    mockAcademicTests = mockAcademicTests.filter((t) => t.id !== id);
  },

  addWorkExperience: async (input: WorkExperienceInput): Promise<WorkExperience> => {
    await delay(200);
    const item: WorkExperience = { ...input, id: uuid() };
    mockWorkExperiences = [...mockWorkExperiences, item];
    return item;
  },
  updateWorkExperience: async (id: string, patch: Partial<WorkExperienceInput>): Promise<WorkExperience> => {
    await delay(200);
    const item = { ...mockWorkExperiences.find((w) => w.id === id), ...patch, id } as WorkExperience;
    mockWorkExperiences = mockWorkExperiences.map((w) => (w.id === id ? item : w));
    return item;
  },
  removeWorkExperience: async (id: string): Promise<void> => {
    await delay(200);
    mockWorkExperiences = mockWorkExperiences.filter((w) => w.id !== id);
  },

  getDegreeLevels: async (params: SearchListParams = {}): Promise<Paginated<Lookup>> => {
    console.log("[mock] GET /platform-users/degree-levels", params);
    await delay(150);
    return filterLookup(mockDegreeLevels, params);
  },
  getAreasOfStudy: async (params: SearchListParams = {}): Promise<Paginated<Lookup>> => {
    console.log("[mock] GET /platform-users/areas-of-study", params);
    await delay(150);
    return filterLookup(mockAreasOfStudy, params);
  },

  getTests: async (): Promise<PlatformTest[]> => {
    console.log("[mock] GET /search/tests");
    await delay(150);
    return SEEDED_TESTS;
  },
};
