import type {
  BusinessProfile, BusinessProfilePatch, BusinessRegisterInput, RegisterBusinessResult, SelectOption,
  UpdateSubCategoryParams,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MOCK_BUSINESS_CATEGORIES: SelectOption[] = [
  { value: "1", label: "Education Agent" },
  { value: "2", label: "Institution" },
  { value: "3", label: "Service Provider" },
];

let mockProfile: BusinessProfile = {
  id: 1,
  schema_name: "mock-org-id",
  business_name: "Mock Agency",
  subdomain: "mock-agency",
  business_type: null,
  business_category_id: null,
  email: null,
  phone: null,
  logo_url: null,
  cover_url: null,
  website: null,
  description: null,
  country_id: null,
  state: null,
  city: null,
  address: null,
  postcode: null,
  latitude: null,
  longitude: null,
  onboarding_completed: false,
};

export const businessMockApi = {
  updateSubCategory: async (params: UpdateSubCategoryParams): Promise<void> => {
    console.log("[mock] POST /user/update", params);
    await delay(300);
  },

  registerBusiness: async (input: BusinessRegisterInput): Promise<RegisterBusinessResult> => {
    console.log("[mock] POST /businesses/register", input);
    await delay(500);
    mockProfile = { ...mockProfile, ...input, onboarding_completed: true };
    return {
      org: { id: mockProfile.id, org_id: mockProfile.schema_name, subdomain: input.subdomain, business_name: input.business_name },
      access_token: "mock-access-token",
      message: "Business created.",
    };
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

  uploadImage: async (category: "logo" | "cover", file: File): Promise<{ storage_path: string }> => {
    console.log(`[mock] POST /businesses/me/files?category=${category}`, file.name);
    await delay(400);
    const url = URL.createObjectURL(file);
    mockProfile = { ...mockProfile, [category === "logo" ? "logo_url" : "cover_url"]: url };
    return { storage_path: url };
  },

  getBusinessCategories: async (search?: string): Promise<SelectOption[]> => {
    console.log("[mock] GET /businesses/business-categories", search);
    await delay(200);
    if (!search) return MOCK_BUSINESS_CATEGORIES;
    return MOCK_BUSINESS_CATEGORIES.filter((c) => c.label.toLowerCase().includes(search.toLowerCase()));
  },
};
