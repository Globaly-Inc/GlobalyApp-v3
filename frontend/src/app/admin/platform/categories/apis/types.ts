export type ModerationStatus = "pending" | "approved" | "rejected";

export type Category = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
};

export type CategoryInput = {
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
};

/** degree_levels and areas_of_study share one shape. */
export type Lookup = {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
};

export type LookupInput = Omit<Lookup, "id">;

export type LookupKind = "degree-levels" | "areas-of-study";

export type FeeType = {
  id: number;
  name: string;
  slug: string;
  business_id: number | null;
  status: ModerationStatus;
  is_global: boolean;
  sort_order: number;
};

export type FeeTypeInput = {
  name: string;
  slug: string;
  sort_order: number;
  is_global: boolean;
};

export type IssuingOrganization = {
  id: number;
  name: string;
  logo_url: string | null;
  website: string | null;
};

export type Accreditation = {
  id: number;
  name: string;
  issuing_organization_id: number | null;
  issuing_organization_name: string | null;
  issuing_organization_logo_url: string | null;
  website: string | null;
  description: string | null;
  business_id: number | null;
  is_global: boolean;
  status: ModerationStatus;
  sort_order: number;
  scope_country_ids: number[];
};

export type AccreditationInput = {
  name: string;
  issuing_organization_id: number | null;
  website: string | null;
  description: string | null;
  sort_order: number;
  scope_country_ids: number[];
};

export type CountryOption = {
  id: number;
  name: string;
  iso2: string;
};
