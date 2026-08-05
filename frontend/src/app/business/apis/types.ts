export type BusinessType = "agent" | "institution" | "service_provider" | "immigration_department";

export type BusinessProfile = {
  business_name: string;
  subdomain: string;
  business_type: BusinessType | null;
  phone: string | null;
  country_id: number | null;
  state: string | null;
  city: string | null;
  address: string | null;
  postcode: string | null;
  onboarding_completed: boolean;
};

export type BusinessProfilePatch = Partial<
  Pick<
    BusinessProfile,
    "business_type" | "phone" | "country_id" | "state" | "city" | "address" | "postcode" | "onboarding_completed"
  >
>;

export type UpdateSubCategoryParams = {
  sub_category: BusinessType;
};
