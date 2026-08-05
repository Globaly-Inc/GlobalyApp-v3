import type { BusinessProfile, BusinessProfilePatch, UpdateSubCategoryParams } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockProfile: BusinessProfile = {
  business_name: "Mock Agency",
  subdomain: "mock-agency",
  business_type: null,
  phone: null,
  country_id: null,
  state: null,
  city: null,
  address: null,
  postcode: null,
  onboarding_completed: false,
};

export const businessMockApi = {
  updateSubCategory: async (params: UpdateSubCategoryParams): Promise<void> => {
    console.log("[mock] POST /user/update", params);
    await delay(300);
  },

  getMyProfile: async (): Promise<BusinessProfile> => {
    console.log("[mock] GET /businesses/me");
    await delay(300);
    return mockProfile;
  },

  updateMyProfile: async (patch: BusinessProfilePatch): Promise<BusinessProfile> => {
    console.log("[mock] PATCH /businesses/me", patch);
    await delay(300);
    mockProfile = { ...mockProfile, ...patch };
    return mockProfile;
  },
};
