import type { StudentProfile, StudentProfilePatch, UpdateSubCategoryParams } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockProfile: StudentProfile = {
  individual_category: null,
  nationality_id: null,
  country_of_residence_id: null,
  date_of_birth: null,
  gender: null,
  personal_address_street: null,
  preferred_destinations: null,
  preferred_fields: null,
  preferred_degree_levels: null,
  onboarding_completed: false,
};

export const personalMockApi = {
  getMyProfile: async (): Promise<StudentProfile> => {
    console.log("[mock] GET /students/me");
    await delay(300);
    return mockProfile;
  },

  updateMyProfile: async (patch: StudentProfilePatch): Promise<StudentProfile> => {
    console.log("[mock] PATCH /students/me", patch);
    await delay(300);
    mockProfile = { ...mockProfile, ...patch };
    return mockProfile;
  },

  updateSubCategory: async (params: UpdateSubCategoryParams): Promise<void> => {
    console.log("[mock] POST /user/update", params);
    await delay(300);
  },
};
