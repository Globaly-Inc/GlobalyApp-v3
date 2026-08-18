export type StudentProfile = {
  // platform_users
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  photo_url: string | null;
  cover_url: string | null;
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
  latitude: number | null;
  longitude: number | null;
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
  /** Server-computed. null only if an older backend response lacks it. */
  completion: ProfileCompletion | null;
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

/**
 * Profile completion, computed SERVER-side. The browser used to compute this independently in
 * profile-completion.ts, which has been deleted: the backend needs the same figure to decide referral
 * qualification, and two implementations of one rule would inevitably drift.
 */
export type CompletionItem = { label: string; met: boolean };
export type ProfileCompletion = { percentage: number; items: CompletionItem[] };

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
