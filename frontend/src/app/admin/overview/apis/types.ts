export type DashboardPreset = "last7" | "last30" | "last90";

export type SiteAccessSettings = {
  is_locked: boolean;
  access_code: string | null;
};

export type GrowthPoint = { day: string; count: number };

export type FeatureUsage = {
  key: string;
  label: string;
  count: number;
  last_week: number;
};

export type RecentSignup = {
  id: number;
  uuid: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  created_at: string;
};

export type DashboardData = {
  preset: string;
  generated_at: string;
  summary: {
    total_users: number;
    /** Businesses + institutions combined — one concept product-wide. */
    total_businesses: number;
    active_businesses: number;
    total_admins: number;
    total_extraction_jobs: number;
  };
  feature_usage: FeatureUsage[];
  growth: {
    users: GrowthPoint[];
    businesses: GrowthPoint[];
    activity: GrowthPoint[];
  };
  user_breakdown: {
    by_category: { category: string; count: number }[];
  };
  extraction: {
    by_status: { status: string; count: number }[];
  };
  recent_signups: RecentSignup[];
};
