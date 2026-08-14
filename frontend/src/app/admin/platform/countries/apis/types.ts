export type PaginationMeta = { page: number; limit: number; total: number; totalPages: number };
export type CountryStats = { total: number; active: number; featured: number };
export type CountryListParams = { page?: number; limit?: number; search?: string; filter?: "all" | "active" | "featured" };
export type CountryListResult = { countries: CountrySummary[]; meta: PaginationMeta; stats: CountryStats };

export type Weather = {
  label: string | null;
  icon: string | null;
  description: string | null;
  temp_range: string | null;
} | null;

export type Country = {
  id: number;
  name: string;
  slug: string;
  iso2: string;
  iso3: string;
  phone_code: string | null;
  currency: string | null;
  currency_symbol: string | null;
  region: string | null;
  is_active: boolean;
  flag_emoji: string | null;
  capital: string | null;
  languages: string[];
  timezone: string | null;
  population: number | null;
  area_km2: number | null;
  about: string | null;
  why_study_here: string | null;
  hero_image_url: string | null;
  thumbnail_image_url: string | null;
  gallery_images: string[];
  youtube_embed_url: string | null;
  visa_type: string | null;
  visa_description: string | null;
  visa_processing_time: string | null;
  visa_fee: string | null;
  avg_tuition_min: number | null;
  avg_tuition_max: number | null;
  avg_tuition_currency: string | null;
  student_count_label: string | null;
  universities_count_label: string | null;
  cost_of_living_label: string | null;
  work_rights_label: string | null;
  weather_summer: Weather;
  weather_autumn: Weather;
  weather_winter: Weather;
  weather_spring: Weather;
  is_featured: boolean;
  sort_order: number;
  meta_title: string | null;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
};

export type CountryInput = Omit<Country, "id" | "created_at" | "updated_at">;

export type CountrySummary = {
  id: number;
  name: string;
  slug: string;
  iso2: string;
  region: string;
  capital: string | null;
  flag_emoji: string | null;
  thumbnail_image_url: string | null;
  gallery_images: string[];
  youtube_embed_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  city_count: number;
};

export type City = {
  id: number;
  country_id: number;
  name: string;
  slug: string;
  state_name: string | null;
  hero_image_url: string | null;
  thumbnail_image_url: string | null;
  about: string | null;
  population_label: string | null;
  area_label: string | null;
  weather_label: string | null;
  timezone: string | null;
  highlights: string[];
  is_featured: boolean;
  sort_order: number;
  status: "active" | "pending" | "rejected";
  meta_title: string | null;
  meta_description: string | null;
};

export type CityInput = Omit<City, "id" | "country_id">;
