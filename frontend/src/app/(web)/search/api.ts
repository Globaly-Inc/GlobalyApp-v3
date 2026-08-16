import type { CourseDetail, CourseFilterOptions, Paginated, SearchBusiness, SearchCourse, SearchJob } from "./types";
import {
  mockGetCourseBySlug, mockGetCourseFilters, mockGetCourses, mockGetEducationAgencies, mockGetInstitutions,
  mockGetMigrationAgents, mockGetStudentJobs, mockGetVisaServices,
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
};

function buildQuery(params: SearchFilterParams) {
  const qs = new URLSearchParams();
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  if (params.country) qs.set("country", params.country);
  if (params.city) qs.set("city", params.city);
  if (params.search) qs.set("search", params.search);
  if (params.degree_level) qs.set("degree_level", params.degree_level);
  if (params.subject_area) qs.set("subject_area", params.subject_area);
  if (params.job_type) qs.set("job_type", params.job_type);
  if (params.is_remote) qs.set("is_remote", "true");
  if (params.fee_min != null) qs.set("fee_min", String(params.fee_min));
  if (params.fee_max != null) qs.set("fee_max", String(params.fee_max));
  if (params.currency) qs.set("currency", params.currency);
  if (params.intake_year != null) qs.set("intake_year", String(params.intake_year));
  if (params.sort) qs.set("sort", params.sort);
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

export async function getCourseFilters(): Promise<CourseFilterOptions> {
  if (USE_MOCK_DATA) return mockGetCourseFilters();
  const res = await fetch(`${API_BASE}/search/courses/filters`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error("Failed to load course filters");
  return res.json();
}

export async function getCourseBySlug(slug: string): Promise<CourseDetail | null> {
  if (USE_MOCK_DATA) return mockGetCourseBySlug(slug);
  const res = await fetch(`${API_BASE}/search/courses/${slug}`, { next: { revalidate: 30 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load course");
  return res.json();
}
