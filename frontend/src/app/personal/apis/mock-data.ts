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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockProfile: StudentProfile = {
  first_name: "Test",
  last_name: "Student",
  email: "test.student@example.com",
  phone: null,
  photo_url: null,
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
};

let mockQualifications: Qualification[] = [];
let mockLanguageTests: LanguageTest[] = [];
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

  getFullProfile: async (): Promise<FullProfile> => {
    console.log("[mock] GET /platform-users/me (full)");
    await delay(300);
    return {
      profile: mockProfile,
      qualifications: mockQualifications,
      languageTests: mockLanguageTests,
      workExperiences: mockWorkExperiences,
    };
  },

  addQualification: async (input: QualificationInput): Promise<Qualification> => {
    await delay(200);
    const item: Qualification = { ...input, id: crypto.randomUUID() };
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
    const item: LanguageTest = { ...input, id: crypto.randomUUID() };
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

  addWorkExperience: async (input: WorkExperienceInput): Promise<WorkExperience> => {
    await delay(200);
    const item: WorkExperience = { ...input, id: crypto.randomUUID() };
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
};
