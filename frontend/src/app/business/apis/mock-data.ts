import type {
  BusinessCategoryOption, BusinessProfile, BusinessProfilePatch, BusinessRegisterInput,
  RegisterBusinessResult, UpdateSubCategoryParams,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MOCK_BUSINESS_CATEGORIES: BusinessCategoryOption[] = [
  { value: "1", label: "Education Agency", slug: "education_agency", description: "Education Consultants and Migration Agents", icon: "Users" },
  { value: "2", label: "Institutions", slug: "institutions", description: "Universities, colleges, and educational institutions", icon: "Building2" },
  { value: "3", label: "Visa Services", slug: "visa_services", description: "Visa application and immigration support services", icon: "FileCheck" },
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
  status: "unverified",
  cover_position: null,
  is_published: false,
  show_team_public: true,
  public_visibility: {},
  currency: null,
  gallery_images: null,
  video_urls: null,
  registration_licenses: null,
  linkedin_url: null,
  facebook_url: null,
  instagram_url: null,
  twitter_url: null,
  youtube_url: null,
  whatsapp_url: null,
  tiktok_url: null,
  threads_url: null,
  messenger_url: null,
  telegram_url: null,
  line_url: null,
  viber_url: null,
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

  getBusinessCategories: async (search?: string): Promise<BusinessCategoryOption[]> => {
    console.log("[mock] GET /businesses/business-categories", search);
    await delay(200);
    if (!search) return MOCK_BUSINESS_CATEGORIES;
    return MOCK_BUSINESS_CATEGORIES.filter((c) => c.label.toLowerCase().includes(search.toLowerCase()));
  },
};
