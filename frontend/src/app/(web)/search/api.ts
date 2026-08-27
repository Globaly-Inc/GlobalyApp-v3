import type {
  BusinessDetail, CourseDetail, CourseFilterOptions, InstitutionDetail, InstitutionFilterOptions,
  Paginated, SearchBusiness, SearchCourse, SearchScholarship,
  SearchJob, SearchService, VisaServiceProviderDetail,
} from "./types";
import type { PlatformTest } from "@/lib/tests-catalog";
import {
  mockGetBusinessBySubdomain, mockGetCourseBySlug, mockGetCourseFilters, mockGetCourses, mockGetEducationAgencies,
  mockGetInstitutionBySlug, mockGetInstitutionCourses, mockGetInstitutions, mockGetMigrationAgents,
  mockGetStudentJobs, mockGetTests, mockGetVisaServices, mockGetVisaServiceProviderBySlug, mockGetScholarships, mockGetServices
} from "./mock-data";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;
const USE_MOCK_DATA = process.env.NEXT_PUBLIC_MOCK_DATA === "true";

export type SearchFilterParams = {
  page?: number;
  country?: string;
  city?: string;
  search?: string;
  degree_level?: string;
  subject_area?: string;
  job_type?: string;
  is_remote?: boolean;
  fee_min?: number;
  fee_max?: number;
  currency?: string;
  intake_year?: number;
  sort?: string;
  basis?: string;
  licensed_only?: boolean;
  institution_type?: string;
  /** "YYYY-MM" from the Upcoming Intake picker. */
  intake_from?: string;
};

function buildQuery(params: SearchFilterParams) {
  const qs = new URLSearchParams();
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  if (params.country) qs.set("country", params.country);
  if (params.city) qs.set("city", params.city);
  if (params.search) qs.set("search", params.search);
  if (params.degree_level) qs.set("degree_level", params.degree_level);
  if (params.subject_area) qs.set("subject_area", params.subject_area);
  if (params.institution_type) qs.set("institution_type", params.institution_type);
  if (params.intake_from) qs.set("intake_from", params.intake_from);
  if (params.job_type) qs.set("job_type", params.job_type);
  if (params.is_remote) qs.set("is_remote", "true");
  if (params.fee_min != null) qs.set("fee_min", String(params.fee_min));
  if (params.fee_max != null) qs.set("fee_max", String(params.fee_max));
  if (params.currency) qs.set("currency", params.currency);
  if (params.intake_year != null) qs.set("intake_year", String(params.intake_year));
  if (params.sort) qs.set("sort", params.sort);
  if (params.licensed_only) qs.set("licensed_only", "true");
  return qs;
}

async function fetchPaginated<T>(path: string, params: SearchFilterParams): Promise<Paginated<T>> {
  const res = await fetch(`${API_BASE}/${path}?${buildQuery(params)}`, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

export const getCourses = (params: SearchFilterParams): Promise<Paginated<SearchCourse>> =>
  USE_MOCK_DATA ? Promise.resolve(mockGetCourses(params)) : fetchPaginated<SearchCourse>("search/courses", params);

export const getInstitutions = (params: SearchFilterParams): Promise<Paginated<SearchBusiness>> =>
  USE_MOCK_DATA ? Promise.resolve(mockGetInstitutions(params)) : fetchPaginated<SearchBusiness>("search/institutions", params);

const NO_INSTITUTION_FILTERS: InstitutionFilterOptions = { institution_types: [], intake_months: [] };

/**
 * Facets for the institutions filter panel. These only populate optional filter controls, so a
 * failure degrades to an empty panel rather than taking the whole results page down with it.
 */
export async function getInstitutionFilters(): Promise<InstitutionFilterOptions> {
  if (USE_MOCK_DATA) return NO_INSTITUTION_FILTERS;
  const res = await fetch(`${API_BASE}/search/institutions/filters`, { next: { revalidate: 300 } });
  if (!res.ok) return NO_INSTITUTION_FILTERS;
  return res.json();
}

export const getEducationAgencies = (params: SearchFilterParams): Promise<Paginated<SearchBusiness>> =>
  USE_MOCK_DATA
    ? Promise.resolve(mockGetEducationAgencies(params))
    : fetchPaginated<SearchBusiness>("search/education-agencies", params);

export const getVisaServices = (params: SearchFilterParams): Promise<Paginated<SearchBusiness>> =>
  USE_MOCK_DATA ? Promise.resolve(mockGetVisaServices(params)) : fetchPaginated<SearchBusiness>("search/visa-services", params);

export const getMigrationAgents = (params: SearchFilterParams): Promise<Paginated<SearchBusiness>> =>
  USE_MOCK_DATA
    ? Promise.resolve(mockGetMigrationAgents(params))
    : fetchPaginated<SearchBusiness>("search/migration-agents", params);

export const getStudentJobs = (params: SearchFilterParams): Promise<Paginated<SearchJob>> =>
  USE_MOCK_DATA ? Promise.resolve(mockGetStudentJobs(params)) : fetchPaginated<SearchJob>("students/jobs", params);

// The dedicated scholarships endpoint (`/api/v3/scholarships`) uses its own query param
// names (q, degree_level, coverage_min) rather than the generic search/* convention above,
// so it gets its own query builder instead of reusing buildQuery().
export const getScholarshipsSearch = (params: SearchFilterParams): Promise<Paginated<SearchScholarship>> => {
  if (USE_MOCK_DATA) return Promise.resolve(mockGetScholarships(params));
  const qs = new URLSearchParams();
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  if (params.search) qs.set("q", params.search);
  if (params.country) qs.set("country", params.country);
  if (params.basis) qs.set("basis", params.basis);
  if (params.degree_level) qs.set("degree_level", params.degree_level);
  if (params.fee_min != null) qs.set("coverage_min", String(params.fee_min));
  return fetch(`${API_BASE}/scholarships?${qs}`, { next: { revalidate: 30 } }).then((res) => {
    if (!res.ok) throw new Error("Failed to load scholarships");
    return res.json();
  });
};

export const getServices = (params: SearchFilterParams): Promise<Paginated<SearchService>> =>
  USE_MOCK_DATA ? Promise.resolve(mockGetServices(params)) : fetchPaginated<SearchService>("search/services", params);

export async function getCourseFilters(): Promise<CourseFilterOptions> {
  if (USE_MOCK_DATA) return mockGetCourseFilters();
  const res = await fetch(`${API_BASE}/search/courses/filters`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error("Failed to load course filters");
  return res.json();
}

/**
 * The platform test catalogue. Short, changes rarely and is read by every course page, so it is
 * cached for five minutes rather than fetched per render.
 */
export async function getTests(): Promise<PlatformTest[]> {
  if (USE_MOCK_DATA) return mockGetTests();
  const res = await fetch(`${API_BASE}/search/tests`, { next: { revalidate: 300 } });
  // A missing logo is cosmetic — never fail a course page over it.
  if (!res.ok) return [];
  return res.json();
}

export async function getCourseBySlug(slug: string): Promise<CourseDetail | null> {
  if (USE_MOCK_DATA) return mockGetCourseBySlug(slug);
  const res = await fetch(`${API_BASE}/search/courses/${slug}`, { next: { revalidate: 30 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load course");
  const data = await res.json();
  // Same guard as the institution fetch — the page maps over these, so a payload from an API
  // that predates them must not take the whole page down.
  return {
    ...data,
    campuses: data.campuses ?? [],
    institution: data.institution ? { ...data.institution, gallery_image_urls: data.institution.gallery_image_urls ?? [] } : null,
    weather: data.weather ?? null,
    city_link: data.city_link ?? null,
  };
}

export async function getInstitutionBySlug(slug: string): Promise<InstitutionDetail | null> {
  if (USE_MOCK_DATA) return mockGetInstitutionBySlug(slug);
  const res = await fetch(`${API_BASE}/search/institutions/${slug}`, { next: { revalidate: 30 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load institution");
  const data = await res.json();
  // The profile page maps over every one of these, so a payload from an API that predates them
  // (or a partial one) must not take the whole page down.
  return {
    ...data,
    campuses: data.campuses ?? [],
    members: data.members ?? [],
    subject_areas: data.subject_areas ?? [],
    degree_levels: data.degree_levels ?? [],
  };
}

export async function getInstitutionCourses(
  slug: string, params: Pick<SearchFilterParams, "page" | "search" | "degree_level"> & { limit?: number },
): Promise<Paginated<SearchCourse>> {
  if (USE_MOCK_DATA) return mockGetInstitutionCourses(slug, params);
  const qs = new URLSearchParams();
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  if (params.search) qs.set("search", params.search);
  if (params.degree_level) qs.set("degree_level", params.degree_level);
  if (params.limit) qs.set("limit", String(params.limit));
  const res = await fetch(`${API_BASE}/search/institutions/${slug}/courses?${qs}`, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error("Failed to load institution courses");
  return res.json();
}

export async function getVisaServiceProviderBySlug(slug: string): Promise<VisaServiceProviderDetail | null> {
  if (USE_MOCK_DATA) return mockGetVisaServiceProviderBySlug(slug);
  const res = await fetch(`${API_BASE}/search/visa-services/${slug}`, { next: { revalidate: 30 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load visa service provider");
  return res.json();
}

export async function getBusinessBySubdomain(subdomain: string): Promise<BusinessDetail | null> {
  if (USE_MOCK_DATA) return mockGetBusinessBySubdomain(subdomain);
  const res = await fetch(`${API_BASE}/search/businesses/${subdomain}`, { next: { revalidate: 30 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load business");
  return res.json();
}
