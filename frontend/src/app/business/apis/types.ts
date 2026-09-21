export type BusinessType = "agent" | "institution" | "service_provider" | "immigration_department";

export type SocialLinks = {
  linkedin_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  youtube_url: string | null;
  whatsapp_url: string | null;
  tiktok_url: string | null;
  threads_url: string | null;
  messenger_url: string | null;
  telegram_url: string | null;
  line_url: string | null;
  viber_url: string | null;
};

export type CoverPosition = { x: number; y: number; zoom: number };

export type BusinessProfile = SocialLinks & {
  id: number;
  schema_name: string;
  business_name: string;
  subdomain: string;
  business_type: BusinessType | null;
  business_category_id: number | null;
  /**
   * Institutions only — the ownership sector, "Public" or "Private". Absent on a business, which
   * is classified by `business_category_id` instead.
   */
  institution_type?: string | null;
  /** Resolved from `business_category_id` server-side — the label the profile header badge shows. */
  business_category_name: string | null;
  /** Lucide icon name on the category row, or null when it sets none. */
  business_category_icon: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  cover_url: string | null;
  cover_position: CoverPosition | null;
  website: string | null;
  description: string | null;
  country_id: number | null;
  state: string | null;
  city: string | null;
  address: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  onboarding_completed: boolean;
  status: "unverified" | "claim_pending" | "verified" | "suspended" | "rejected";
  is_published: boolean;
  show_team_public: boolean;
  public_visibility: Record<string, boolean> | null;
  currency: string | null;
  gallery_images: string[] | null;
  video_urls: string[] | null;
  registration_licenses: Record<string, unknown> | null;
};

export type BusinessProfilePatch = Partial<
  Pick<
    BusinessProfile,
    | "business_name" | "business_type" | "business_category_id" | "institution_type"
    | "email" | "phone" | "description" | "website"
    | "country_id" | "state" | "city" | "address" | "postcode" | "latitude" | "longitude" | "onboarding_completed"
    | "is_published" | "show_team_public" | "public_visibility" | "currency" | "cover_position"
    | "linkedin_url" | "facebook_url" | "instagram_url" | "twitter_url" | "youtube_url" | "whatsapp_url"
    | "tiktok_url" | "threads_url" | "messenger_url" | "telegram_url" | "line_url" | "viber_url"
    | "gallery_images" | "video_urls" | "registration_licenses"
  >
>;

export type SelectOption = { value: string; label: string };

/** A business_categories row shaped for pickers — superset of SelectOption so
 * plain Comboboxes can consume it too. */
export type BusinessCategoryOption = SelectOption & {
  slug: string;
  description: string | null;
  icon: string | null;
};

export type BusinessRegisterInput = {
  business_name: string;
  business_category_id: number;
  phone: string;
  country_id: number;
  address: string;
  state?: string;
  city?: string;
  postcode?: string;
};

export type RegisterBusinessResult = {
  org: { id: number; org_id: string; subdomain: string; business_name: string };
  access_token: string;
  message: string;
};

export type InstitutionRegisterInput = {
  institution_name: string;
  phone?: string;
  country_id?: number;
  address?: string;
  state?: string;
  city?: string;
  postcode?: string;
};

export type RegisterInstitutionResult = {
  institution: { id: number; org_id: string; subdomain: string; institution_name: string };
  access_token: string;
  message: string;
};

/** Backs "Improve with AI" on the profile description — a draft to review, not to publish as-is. */
export type AiAssistInput = {
  field: "description";
  business_name?: string;
  business_type?: string;
  hint?: string;
};

export type AiAssistResult = { text: string };
