export type BusinessType = "agent" | "institution" | "service_provider" | "immigration_department";

export type BusinessProfile = {
  id: number;
  schema_name: string;
  business_name: string;
  subdomain: string;
  business_type: BusinessType | null;
  business_category_id: number | null;
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
  latitude: number | null;
  longitude: number | null;
  onboarding_completed: boolean;
};

export type BusinessProfilePatch = Partial<
  Pick<
    BusinessProfile,
    | "business_type" | "business_category_id" | "email" | "phone" | "description"
    | "country_id" | "state" | "city" | "address" | "postcode" | "latitude" | "longitude" | "onboarding_completed"
  >
>;

export type UpdateSubCategoryParams = {
  sub_category: BusinessType;
};

export type SelectOption = { value: string; label: string };

export type PlaceSuggestion = { placeId: string; description: string };
export type PlaceDetails = {
  address: string;
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
  postcode: string | null;
};
