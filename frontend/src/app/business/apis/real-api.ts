import { httpDelete, httpGet, httpPatch, httpPost, httpPostForm, isInstitutionContext } from "@/lib/api/http";
import type {
  AiAssistInput, AiAssistResult,
  BusinessCategoryOption, BusinessProfile, BusinessProfilePatch, BusinessRegisterInput,
  RegisterBusinessResult, InstitutionRegisterInput, RegisterInstitutionResult,
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
  // Institutions upload gallery media through the same Media card as businesses, and
  // `/institutions/me` signs these the same way — dropping them here is what made an upload
  // succeed and then vanish.
  gallery_images: (string | null)[] | null;
  video_urls: (string | null)[] | null;
  public_visibility: Record<string, boolean> | null;
  /** Ownership sector — "Public" or "Private". Not a category like "University"; see
   *  migration 20260909_003, which narrowed this column to those two values. */
  institution_type: string | null;
};

/**
 * The hero badge, matching what the public institution page shows for the same record: the sector
 * qualifies the word rather than standing alone, so "Public" here can't be mistaken for the
 * Public/Private visibility pills on the cards below.
 */
function institutionCategoryLabel(institutionType: string | null): string {
  return institutionType ? `${institutionType} Institution` : "Institution";
}

/** A path the server couldn't sign comes back as null; nothing downstream can render one. */
function signedOnly(urls: (string | null)[] | null | undefined): string[] | null {
  if (!urls) return null;
  return urls.filter((u): u is string => !!u);
}

/**
 * `BusinessProfile` types these as `string[]`, but the server resolves each path to a signed URL
 * and yields null for any it couldn't sign — so the array it actually sends is `(string | null)[]`.
 * Dropping the nulls here keeps that off every consumer, which would otherwise render an `<img>`
 * with no src and a null React key.
 */
function withSignedMedia(profile: BusinessProfile): BusinessProfile {
  return {
    ...profile,
    gallery_images: signedOnly(profile.gallery_images as (string | null)[] | null),
    video_urls: signedOnly(profile.video_urls as (string | null)[] | null),
  };
}

function institutionToBusinessProfile(inst: InstitutionMe): BusinessProfile {
  return {
    id: inst.id,
    schema_name: inst.schema_name,
    business_name: inst.institution_name,
    subdomain: inst.subdomain,
    business_type: null,
    business_category_id: null,
    // Institutions aren't categorised against `business_categories`; their ownership sector is
    // what the badge carries, exactly as on the public institution page.
    institution_type: inst.institution_type,
    business_category_name: institutionCategoryLabel(inst.institution_type),
    business_category_icon: "GraduationCap",
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
    // `?? {}` and never null: null is what tells the profile page a record cannot store section
    // visibility at all, and since 20260915_002 institutions can.
    public_visibility: inst.public_visibility ?? {},
    currency: null,
    registration_licenses: null,
    gallery_images: signedOnly(inst.gallery_images),
    video_urls: signedOnly(inst.video_urls),
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
  "postcode", "is_published", "public_visibility", "institution_type",
] as const satisfies readonly (keyof BusinessProfilePatch)[];

function toInstitutionPatch(patch: BusinessProfilePatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of INSTITUTION_PATCHABLE_KEYS) {
    if (key in patch) out[key] = patch[key];
  }
  // The one field whose name differs between the two tables. Without the rename the institution
  // endpoint's `.strict()` schema would reject the key, and the General Information card would
  // report a save it never made.
  if ("business_name" in patch) out.institution_name = patch.business_name;
  return out;
}

export const businessRealApi = {
  registerBusiness: (input: BusinessRegisterInput): Promise<RegisterBusinessResult> =>
    httpPost("/businesses/register", input),

  registerInstitution: (input: InstitutionRegisterInput): Promise<RegisterInstitutionResult> =>
    httpPost("/platform-users/me/onboarding/institution", input),

  getMyProfile: async (): Promise<BusinessProfile> => {
    if (isInstitutionContext()) {
      return institutionToBusinessProfile(await httpGet<InstitutionMe>("/institutions/me"));
    }
    return withSignedMedia(await httpGet<BusinessProfile>("/businesses/me"));
  },

  updateMyProfile: async (patch: BusinessProfilePatch): Promise<BusinessProfile> => {
    if (isInstitutionContext()) {
      const updated = await httpPatch<InstitutionMe>("/institutions/me", toInstitutionPatch(patch));
      return institutionToBusinessProfile(updated);
    }
    return withSignedMedia(await httpPatch<BusinessProfile>("/businesses/me", patch));
  },

  uploadImage: (category: "logo" | "cover" | "gallery", file: File): Promise<{ storage_path: string }> => {
    const form = new FormData();
    form.append("file", file);
    const base = isInstitutionContext() ? "/institutions/me/files" : "/businesses/me/files";
    return httpPostForm(`${base}?category=${category}`, form);
  },

  deleteMedia: (url: string, type: "gallery" | "video"): Promise<void> => {
    const base = isInstitutionContext() ? "/institutions/me/media" : "/businesses/me/media";
    return httpDelete(base, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, type }),
    });
  },

  getBusinessCategories: async (search?: string): Promise<BusinessCategoryOption[]> => {
    const q = new URLSearchParams({ limit: "10" });
    if (search) q.set("search", search);
    const { data } = await httpGet<{
      data: { id: number; name: string; slug: string; description: string | null; icon: string | null }[];
    }>(`/businesses/business-categories?${q}`);
    return data.map((c) => ({ value: String(c.id), label: c.name, slug: c.slug, description: c.description, icon: c.icon }));
  },

  // Business-only: the endpoint sits behind requireBusinessContext, so the description card hides
  // the button for an institution rather than calling this and getting a 403.
  aiAssist: (input: AiAssistInput): Promise<AiAssistResult> => httpPost("/businesses/me/ai-assist", input),
};
