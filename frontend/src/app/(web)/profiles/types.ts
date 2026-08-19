// Public org profiles — the pages V1 served at /institutions/{slug} and /agent/{slug}.
// V3's sitemap already emits /institutions/{slug} and /agents/{slug} (note the plural,
// which is what the backend's PUBLIC_PATHS canonicalises), so these are the paths.

export type OrgKind = "institution" | "agent";

export type ProfileService = {
  service_id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  study_mode: string[] | null;
  duration_value: number | null;
  duration_unit: string | null;
  min_fee: string | null;
  max_fee: string | null;
  fee_currency: string | null;
  next_intake_date: string | null;
};

export type OrgProfile = {
  id: number;
  slug: string;
  name: string;
  kind: OrgKind;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  gallery_images: string[];
  website: string | null;
  email: string | null;
  phone: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  postcode: string | null;
  is_verified: boolean;
  category: { id: number; name: string; slug: string } | null;
  country: { id: number; name: string; iso2: string | null; slug: string | null } | null;
  social: {
    linkedin: string | null;
    facebook: string | null;
    instagram: string | null;
    twitter: string | null;
    youtube: string | null;
    whatsapp: string | null;
  };
  seo: {
    canonical_url: string;
    title: string;
    description: string;
    og_image: string | null;
    structured_data: Record<string, unknown>;
  };
  services: ProfileService[];
  services_total: number;
};
