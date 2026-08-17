import { httpDelete, httpGet, httpPatch, httpPost, httpPostForm } from "@/lib/api/http";
import type { City, CityInput, Country, CountryInput, CountryListParams, CountryListResult, CountryStats, PaginationMeta, CountrySummary } from "./types";

const BASE = "/admin/platform";

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
  createCountry: (input: CountryInput): Promise<Country> => httpPost(`${BASE}/countries`, input),
  updateCountry: (id: number, input: Partial<CountryInput>): Promise<Country> => httpPatch(`${BASE}/countries/${id}`, input),
  deleteCountry: (id: number): Promise<void> => httpDelete(`${BASE}/countries/${id}`),
  uploadCountryImage: (file: File): Promise<{ url: string }> => {
    const form = new FormData();
    form.append("file", file);
    return httpPostForm(`${BASE}/countries/image`, form);
  },

  getCitiesByCountry: async (countryId: number): Promise<City[]> => {
    const { cities } = await httpGet<{ cities: City[] }>(`${BASE}/countries/${countryId}/cities`);
    return cities;
  },
  createCity: (countryId: number, input: CityInput): Promise<City> => httpPost(`${BASE}/countries/${countryId}/cities`, input),
  updateCity: (id: number, input: Partial<CityInput>): Promise<City> => httpPatch(`${BASE}/cities/${id}`, input),
  deleteCity: (id: number): Promise<void> => httpDelete(`${BASE}/cities/${id}`),
  uploadCityImage: (file: File): Promise<{ url: string }> => {
    const form = new FormData();
    form.append("file", file);
    return httpPostForm(`${BASE}/cities/image`, form);
  },
};
