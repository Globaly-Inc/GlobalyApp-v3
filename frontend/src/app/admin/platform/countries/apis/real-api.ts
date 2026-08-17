import { httpDelete, httpGet, httpPatchForm, httpPostForm } from "@/lib/api/http";
import type { City, CityInput, Country, CountryInput, CountryListParams, CountryListResult, CountryStats, PaginationMeta, CountrySummary } from "./types";

const BASE = "/admin/platform";

function buildImageFormData<T extends { hero_image_url?: string | null; thumbnail_image_url?: string | null; gallery_images?: string[] }>(
  input: T,
  pendingFiles: Map<string, File>,
): FormData {
  const form = new FormData();
  const data: T = { ...input };

  const takeFile = (url: string | null | undefined) => (url ? pendingFiles.get(url) : undefined);

  const heroFile = takeFile(input.hero_image_url);
  if (heroFile) {
    form.append("hero_image", heroFile);
    data.hero_image_url = null;
  }
  const thumbFile = takeFile(input.thumbnail_image_url);
  if (thumbFile) {
    form.append("thumbnail_image", thumbFile);
    data.thumbnail_image_url = null;
  }
  if (input.gallery_images) {
    data.gallery_images = input.gallery_images.map((url) => {
      const file = takeFile(url);
      if (!file) return url;
      form.append("gallery_image", file);
      return null as unknown as string;
    });
  }

  form.append("data", JSON.stringify(data));
  return form;
}

type CountryDto = Country & { city_count: string };

function toSummary(c: CountryDto): CountrySummary {
  return {
    id: c.id, name: c.name, slug: c.slug, iso2: c.iso2, region: c.region ?? "", capital: c.capital,
    flag_emoji: c.flag_emoji, thumbnail_image_url: c.thumbnail_image_url, gallery_images: c.gallery_images ?? [],
    youtube_embed_url: c.youtube_embed_url, is_active: c.is_active, is_featured: c.is_featured,
    city_count: Number(c.city_count),
  };
}

function toQuery(params: CountryListParams): string {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.search) search.set("search", params.search);
  if (params.filter) search.set("filter", params.filter);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const countriesRealApi = {
  getCountries: async (params: CountryListParams = {}): Promise<CountryListResult> => {
    const { data, meta, stats } = await httpGet<{ data: CountryDto[]; meta: PaginationMeta; stats: CountryStats }>(
      `${BASE}/countries${toQuery(params)}`,
    );
    return { countries: data.map(toSummary), meta, stats };
  },
  getCountryById: (id: number): Promise<Country> => httpGet(`${BASE}/countries/${id}`),
  createCountry: (input: CountryInput, pendingFiles: Map<string, File> = new Map()): Promise<Country> =>
    httpPostForm(`${BASE}/countries`, buildImageFormData(input, pendingFiles)),
  updateCountry: (id: number, input: Partial<CountryInput>, pendingFiles: Map<string, File> = new Map()): Promise<Country> =>
    httpPatchForm(`${BASE}/countries/${id}`, buildImageFormData(input, pendingFiles)),
  deleteCountry: (id: number): Promise<void> => httpDelete(`${BASE}/countries/${id}`),

  getCitiesByCountry: async (countryId: number): Promise<City[]> => {
    const { cities } = await httpGet<{ cities: City[] }>(`${BASE}/countries/${countryId}/cities`);
    return cities;
  },
  createCity: (countryId: number, input: CityInput, pendingFiles: Map<string, File> = new Map()): Promise<City> =>
    httpPostForm(`${BASE}/countries/${countryId}/cities`, buildImageFormData(input, pendingFiles)),
  updateCity: (id: number, input: Partial<CityInput>, pendingFiles: Map<string, File> = new Map()): Promise<City> =>
    httpPatchForm(`${BASE}/cities/${id}`, buildImageFormData(input, pendingFiles)),
  deleteCity: (id: number): Promise<void> => httpDelete(`${BASE}/cities/${id}`),
};
