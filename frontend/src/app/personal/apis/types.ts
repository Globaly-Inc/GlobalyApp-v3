export type StudentProfile = {
  // platform_users — read-only, no PATCH route exists for these today
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  photo_url: string | null;
  user_category: string | null;
  user_sub_category: string | null;
  // platform_user_profiles — editable via PATCH /platform-users/me
  nationality_id: number | null;
  country_of_residence_id: number | null;
  city_of_residence: string | null;
  date_of_birth: string | null;
  gender: string | null;
  personal_address_country_id: number | null;
  personal_address_city: string | null;
  personal_address_state: string | null;
  personal_address_street: string | null;
  personal_address_postcode: string | null;
  budget_min: number | null;
  budget_max: number | null;
  budget_currency: string | null;
  include_living_expenses: boolean;
  preferred_destinations: number[] | null;
  preferred_fields: string[] | null;
  preferred_degree_levels: string[] | null;
  expected_start_date: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  onboarding_completed: boolean;
};

export type StudentProfilePatch = Partial<StudentProfile>;

export type UpdateSubCategoryParams = {
  user_sub_category: string;
};

export type Qualification = {
  id: string;
  qualification_type: string | null;
  degree_title: string | null;
  subject_area: string | null;
  institution_name: string | null;
  grading_system: string | null;
  grade_value: string | null;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
};

export type QualificationInput = Omit<Qualification, "id">;

export type LanguageTest = {
  id: string;
  test_status: string | null;
  test_type: string | null;
  overall_score: string | null;
  test_date: string | null;
  sub_scores: Record<string, string> | null;
  sort_order: number;
};

export type LanguageTestInput = Omit<LanguageTest, "id">;

export type WorkExperience = {
  id: string;
  job_title: string;
  organization_name: string | null;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
};

export type WorkExperienceInput = Omit<WorkExperience, "id">;

export type FullProfile = {
  profile: StudentProfile;
  qualifications: Qualification[];
  languageTests: LanguageTest[];
  workExperiences: WorkExperience[];
};
