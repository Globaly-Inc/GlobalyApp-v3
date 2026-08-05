export const USER_CATEGORIES = ["personal", "business"] as const;

export const PERSONAL_SUB_CATEGORIES = ["student", "education_provider", "parents", "explorer"] as const;
export const BUSINESS_SUB_CATEGORIES = ["education_agent", "institution", "service_provider", "immigration_department"] as const;
export const ALL_SUB_CATEGORIES = [...PERSONAL_SUB_CATEGORIES, ...BUSINESS_SUB_CATEGORIES] as const;

export const GENDERS = ["male", "female", "other", "prefer_not_to_say"] as const;
