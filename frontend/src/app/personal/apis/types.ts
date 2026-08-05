export type StudentProfile = {
  individual_category: string | null;
  nationality_id: number | null;
  country_of_residence_id: number | null;
  date_of_birth: string | null;
  gender: string | null;
  personal_address_street: string | null;
  preferred_destinations: string[] | null;
  preferred_fields: string[] | null;
  preferred_degree_levels: string[] | null;
  onboarding_completed: boolean;
};

export type StudentProfilePatch = Partial<StudentProfile>;

export type UpdateSubCategoryParams = {
  sub_categories: string;
};
