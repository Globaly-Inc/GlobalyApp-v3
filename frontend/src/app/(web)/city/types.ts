export type CityDetail = {
  id: number;
  country_id: number;
  name: string;
  slug: string;
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
  meta_title: string | null;
  meta_description: string | null;
  country: {
    id: number;
    name: string;
    slug: string;
    flag_emoji: string | null;
  };
};
