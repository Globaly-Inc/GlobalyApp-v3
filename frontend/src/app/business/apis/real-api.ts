import { httpGet, httpPatch, httpPost, httpPostForm, isInstitutionContext } from "@/lib/api/http";
import type {
  BusinessProfile, BusinessProfilePatch, BusinessRegisterInput, RegisterBusinessResult, SelectOption,
  UpdateSubCategoryParams,
} from "./types";

// Institution accounts render through this exact same business-profile UI (there is no
// separate institution page) — an institution's `/institutions/me` record just gets adapted
// to look like a BusinessProfile. Fields businesses have that institutions don't (category,
// social links, gallery, etc.) come back null/empty, which the profile UI already renders fine.
type InstitutionMe = {
  id: number;
  schema_name: string;
  institution_name: string;
  subdomain: string;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  cover_url: string | null;
  website: string | null;
  description: string | null;
  country_id: number | null;
  state: string | null;
  city: string | null;
  address: string | null;
  postcode: string | null;
  status: string;
  is_published: boolean;
  onboarding_completed: boolean;
};

function institutionToBusinessProfile(inst: InstitutionMe): BusinessProfile {
  return {
    id: inst.id,
    schema_name: inst.schema_name,
    business_name: inst.institution_name,
    subdomain: inst.subdomain,
    business_type: null,
    business_category_id: null,
    email: inst.email,
    phone: inst.phone,
    logo_url: inst.logo_url,
    cover_url: inst.cover_url,
    cover_position: null,
    website: inst.website,
    description: inst.description,
    country_id: inst.country_id,
    state: inst.state,
    city: inst.city,
    address: inst.address,
    postcode: inst.postcode,
    latitude: null,
    longitude: null,
    onboarding_completed: inst.onboarding_completed,
    status: inst.status as BusinessProfile["status"],
    is_published: inst.is_published,
    show_team_public: false,
    public_visibility: null,
    currency: null,
    registration_licenses: null,
    gallery_images: null,
    video_urls: null,
    linkedin_url: null, facebook_url: null, instagram_url: null, twitter_url: null, youtube_url: null,
    whatsapp_url: null, tiktok_url: null, threads_url: null, messenger_url: null, telegram_url: null,
    line_url: null, viber_url: null,
  };
}

// Only these BusinessProfilePatch fields exist on the institutions table — the institution
// endpoint's schema is `.strict()`, so anything else (business_type, social links, ...) must
// be dropped rather than forwarded.
const INSTITUTION_PATCHABLE_KEYS = [
  "email", "phone", "description", "website", "country_id", "state", "city", "address",
  "postcode", "is_published",
] as const satisfies readonly (keyof BusinessProfilePatch)[];

function toInstitutionPatch(patch: BusinessProfilePatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of INSTITUTION_PATCHABLE_KEYS) {
    if (key in patch) out[key] = patch[key];
  }
  return out;
}

export const businessRealApi = {
  updateSubCategory: (params: UpdateSubCategoryParams): Promise<void> => httpPost("/user/update", params),

  registerBusiness: (input: BusinessRegisterInput): Promise<RegisterBusinessResult> =>
    httpPost("/businesses/register", input),

  getMyProfile: async (): Promise<BusinessProfile> => {
    if (isInstitutionContext()) {
      return institutionToBusinessProfile(await httpGet<InstitutionMe>("/institutions/me"));
    }
    return httpGet("/businesses/me");
  },

  updateMyProfile: async (patch: BusinessProfilePatch): Promise<BusinessProfile> => {
    if (isInstitutionContext()) {
      const updated = await httpPatch<InstitutionMe>("/institutions/me", toInstitutionPatch(patch));
      return institutionToBusinessProfile(updated);
    }
    return httpPatch("/businesses/me", patch);
  },

  uploadImage: (category: "logo" | "cover", file: File): Promise<{ storage_path: string }> => {
    const form = new FormData();
    form.append("file", file);
    const base = isInstitutionContext() ? "/institutions/me/files" : "/businesses/me/files";
    return httpPostForm(`${base}?category=${category}`, form);
  },

  getBusinessCategories: async (search?: string): Promise<SelectOption[]> => {
    const q = new URLSearchParams({ limit: "10" });
    if (search) q.set("search", search);
    const { data } = await httpGet<{ data: { id: number; name: string }[] }>(`/businesses/business-categories?${q}`);
    return data.map((c) => ({ value: String(c.id), label: c.name }));
  },
};
