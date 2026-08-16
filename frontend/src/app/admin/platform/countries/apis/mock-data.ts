import type { City, CityInput, Country, CountryInput, CountryListParams, CountryListResult, CountrySummary } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let nextCountryId = 100;
let nextCityId = 1000;

const countries: Country[] = [
  {
    id: 1, name: "Australia", slug: "australia", iso2: "AU", iso3: "AUS", phone_code: "+61",
    currency: "AUD", currency_symbol: "$", region: "Oceania", is_active: true, flag_emoji: "🇦🇺",
    capital: "Canberra", languages: ["English"], timezone: "AEST", population: 26000000, area_km2: 7692024,
    about: "Australia is a top study destination known for its quality education and lifestyle.",
    why_study_here: "World-class universities, post-study work rights, and a high quality of life.",
    hero_image_url: null, thumbnail_image_url: null, gallery_images: [], youtube_embed_url: null,
    visa_type: "Student Visa (subclass 500)", visa_description: "Requires a CoE and financial proof.",
    visa_processing_time: "4-6 weeks", visa_fee: "$710 AUD",
    avg_tuition_min: 20000, avg_tuition_max: 45000, avg_tuition_currency: "AUD",
    student_count_label: "700,000+ international students", universities_count_label: "43 universities",
    cost_of_living_label: "$1,400-$2,500/month", work_rights_label: "48 hours/fortnight during study",
    weather_summer: { label: "Summer", icon: "sun", description: "Hot and dry", temp_range: "18-30°C" },
    weather_autumn: { label: "Autumn", icon: "cloud", description: "Mild", temp_range: "12-22°C" },
    weather_winter: { label: "Winter", icon: "snow", description: "Cool", temp_range: "5-15°C" },
    weather_spring: { label: "Spring", icon: "cloud-sun", description: "Pleasant", temp_range: "10-20°C" },
    is_featured: true, sort_order: 1, meta_title: "Study in Australia", meta_description: "Everything about studying in Australia.",
    created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: 2, name: "Canada", slug: "canada", iso2: "CA", iso3: "CAN", phone_code: "+1",
    currency: "CAD", currency_symbol: "$", region: "North America", is_active: true, flag_emoji: "🇨🇦",
    capital: "Ottawa", languages: ["English", "French"], timezone: "EST", population: 38000000, area_km2: 9984670,
    about: "Canada offers affordable, high-quality education with a welcoming immigration path.",
    why_study_here: "Post-graduation work permits and a clear path to permanent residency.",
    hero_image_url: null, thumbnail_image_url: null, gallery_images: [], youtube_embed_url: null,
    visa_type: "Study Permit", visa_description: "Requires a letter of acceptance and proof of funds.",
    visa_processing_time: "8-12 weeks", visa_fee: "$150 CAD",
    avg_tuition_min: 15000, avg_tuition_max: 35000, avg_tuition_currency: "CAD",
    student_count_label: "620,000+ international students", universities_count_label: "100+ universities",
    cost_of_living_label: "$1,200-$2,200/month", work_rights_label: "20 hours/week during study",
    weather_summer: null, weather_autumn: null, weather_winter: null, weather_spring: null,
    is_featured: true, sort_order: 2, meta_title: null, meta_description: null,
    created_at: "2026-01-02T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z",
  },
  {
    id: 3, name: "United Kingdom", slug: "united-kingdom", iso2: "GB", iso3: "GBR", phone_code: "+44",
    currency: "GBP", currency_symbol: "£", region: "Europe", is_active: true, flag_emoji: "🇬🇧",
    capital: "London", languages: ["English"], timezone: "GMT", population: 67000000, area_km2: 243610,
    about: "Home to some of the world's oldest and most prestigious universities.",
    why_study_here: "Shorter degree durations and a 2-year graduate visa route.",
    hero_image_url: null, thumbnail_image_url: null, gallery_images: [], youtube_embed_url: null,
    visa_type: "Student Route Visa", visa_description: "Requires a CAS from a licensed sponsor.",
    visa_processing_time: "3 weeks", visa_fee: "£490",
    avg_tuition_min: 12000, avg_tuition_max: 38000, avg_tuition_currency: "GBP",
    student_count_label: "600,000+ international students", universities_count_label: "160+ universities",
    cost_of_living_label: "£1,000-£1,800/month", work_rights_label: "20 hours/week during study",
    weather_summer: null, weather_autumn: null, weather_winter: null, weather_spring: null,
    is_featured: false, sort_order: 3, meta_title: null, meta_description: null,
    created_at: "2026-01-03T00:00:00.000Z", updated_at: "2026-01-03T00:00:00.000Z",
  },
  {
    id: 4, name: "Nepal", slug: "nepal", iso2: "NP", iso3: "NPL", phone_code: "+977",
    currency: "NPR", currency_symbol: "₨", region: "South Asia", is_active: false, flag_emoji: "🇳🇵",
    capital: "Kathmandu", languages: ["Nepali"], timezone: "NPT", population: 30000000, area_km2: 147516,
    about: null, why_study_here: null, hero_image_url: null, thumbnail_image_url: null,
    gallery_images: [], youtube_embed_url: null, visa_type: null, visa_description: null,
    visa_processing_time: null, visa_fee: null, avg_tuition_min: null, avg_tuition_max: null,
    avg_tuition_currency: null, student_count_label: null, universities_count_label: null,
    cost_of_living_label: null, work_rights_label: null,
    weather_summer: null, weather_autumn: null, weather_winter: null, weather_spring: null,
    is_featured: false, sort_order: 4, meta_title: null, meta_description: null,
    created_at: "2026-01-04T00:00:00.000Z", updated_at: "2026-01-04T00:00:00.000Z",
  },
];

const citiesByCountry: Record<number, City[]> = {
  1: [
    { id: 1, country_id: 1, name: "Canberra", slug: "canberra", state_name: "ACT", hero_image_url: null, thumbnail_image_url: null, about: null, population_label: "460,000", area_label: "814 km²", weather_label: "Temperate", timezone: "AEST", highlights: ["Capital city", "Parliament House"], is_featured: true, sort_order: 1, status: "active", meta_title: null, meta_description: null },
    { id: 2, country_id: 1, name: "Sydney", slug: "sydney", state_name: "NSW", hero_image_url: null, thumbnail_image_url: null, about: null, population_label: "5.3M", area_label: "12,368 km²", weather_label: "Temperate", timezone: "AEST", highlights: ["Opera House", "Harbour Bridge"], is_featured: true, sort_order: 2, status: "active", meta_title: null, meta_description: null },
  ],
  2: [
    { id: 3, country_id: 2, name: "Ottawa", slug: "ottawa", state_name: "ON", hero_image_url: null, thumbnail_image_url: null, about: null, population_label: "1M", area_label: "2,790 km²", weather_label: "Continental", timezone: "EST", highlights: ["Capital city"], is_featured: true, sort_order: 1, status: "active", meta_title: null, meta_description: null },
  ],
  3: [
    { id: 4, country_id: 3, name: "London", slug: "london", state_name: null, hero_image_url: null, thumbnail_image_url: null, about: null, population_label: "9M", area_label: "1,572 km²", weather_label: "Temperate", timezone: "GMT", highlights: ["Big Ben"], is_featured: true, sort_order: 1, status: "active", meta_title: null, meta_description: null },
  ],
  4: [],
};

function toSummary(c: Country): CountrySummary {
  return {
    id: c.id, name: c.name, slug: c.slug, iso2: c.iso2, region: c.region ?? "", capital: c.capital,
    flag_emoji: c.flag_emoji, thumbnail_image_url: c.thumbnail_image_url, gallery_images: c.gallery_images,
    youtube_embed_url: c.youtube_embed_url, is_active: c.is_active, is_featured: c.is_featured,
    city_count: (citiesByCountry[c.id] ?? []).length,
  };
}

export const countriesMockApi = {
  getCountries: async (params: CountryListParams = {}): Promise<CountryListResult> => {
    console.log("[mock] getCountries", params);
    await delay(300);
    const { page = 1, limit = 20, search, filter } = params;

    let filtered = countries;
    if (search) filtered = filtered.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
    if (filter === "active") filtered = filtered.filter((c) => c.is_active);
    if (filter === "featured") filtered = filtered.filter((c) => c.is_featured);

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const pageRows = filtered.slice(offset, offset + limit);

    return {
      countries: pageRows.map(toSummary),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      stats: {
        total: countries.length,
        active: countries.filter((c) => c.is_active).length,
        featured: countries.filter((c) => c.is_featured).length,
      },
    };
  },
  getCountryById: async (id: number): Promise<Country> => {
    console.log("[mock] getCountryById", id);
    await delay(200);
    const country = countries.find((c) => c.id === id);
    if (!country) throw new Error("Country not found");
    return country;
  },
  createCountry: async (input: CountryInput): Promise<Country> => {
    console.log("[mock] createCountry", input);
    await delay(300);
    const country: Country = { ...input, id: ++nextCountryId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    countries.push(country);
    citiesByCountry[country.id] = [];
    return country;
  },
  updateCountry: async (id: number, input: Partial<CountryInput>): Promise<Country> => {
    console.log("[mock] updateCountry", id, input);
    await delay(300);
    const index = countries.findIndex((c) => c.id === id);
    const existing = countries[index];
    if (!existing) throw new Error("Country not found");
    const updated: Country = { ...existing, ...input, updated_at: new Date().toISOString() };
    countries[index] = updated;
    return updated;
  },
  deleteCountry: async (id: number): Promise<void> => {
    console.log("[mock] deleteCountry", id);
    await delay(300);
    const index = countries.findIndex((c) => c.id === id);
    if (index !== -1) countries.splice(index, 1);
    delete citiesByCountry[id];
  },
  uploadCountryImage: async (file: File): Promise<{ url: string }> => {
    console.log("[mock] uploadCountryImage", file.name);
    await delay(500);
    return { url: URL.createObjectURL(file) };
  },

  getCitiesByCountry: async (countryId: number): Promise<City[]> => {
    console.log("[mock] getCitiesByCountry", countryId);
    await delay(200);
    return citiesByCountry[countryId] ?? [];
  },
  createCity: async (countryId: number, input: CityInput): Promise<City> => {
    console.log("[mock] createCity", countryId, input);
    await delay(300);
    const city: City = { ...input, id: ++nextCityId, country_id: countryId };
    citiesByCountry[countryId] = [...(citiesByCountry[countryId] ?? []), city];
    return city;
  },
  updateCity: async (id: number, input: Partial<CityInput>): Promise<City> => {
    console.log("[mock] updateCity", id, input);
    await delay(300);
    for (const list of Object.values(citiesByCountry)) {
      const index = list.findIndex((c) => c.id === id);
      const existing = list[index];
      if (existing) {
        const updated: City = { ...existing, ...input };
        list[index] = updated;
        return updated;
      }
    }
    throw new Error("City not found");
  },
  deleteCity: async (id: number): Promise<void> => {
    console.log("[mock] deleteCity", id);
    await delay(300);
    for (const [countryId, list] of Object.entries(citiesByCountry)) {
      citiesByCountry[Number(countryId)] = list.filter((c) => c.id !== id);
    }
  },
  uploadCityImage: async (file: File): Promise<{ url: string }> => {
    console.log("[mock] uploadCityImage", file.name);
    await delay(500);
    return { url: URL.createObjectURL(file) };
  },
};
