import { httpDelete, httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type { Paginated, Scholarship, ScholarshipInput } from "./types";

const BASE = "/admin/monitoring/scholarships";

export type ScholarshipListParams = {
  page?: number;
  limit?: number;
  search?: string;
  is_published?: boolean;
  is_featured?: boolean;
  country?: string;
  coverage_min?: number;
  coverage_max?: number;
  deadline_from?: string;
  deadline_to?: string;
};

function toQuery(params: ScholarshipListParams) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  qs.set("limit", String(params.limit ?? 10));
  if (params.search) qs.set("search", params.search);
  if (params.is_published !== undefined) qs.set("is_published", String(params.is_published));
  if (params.is_featured !== undefined) qs.set("is_featured", String(params.is_featured));
  if (params.country) qs.set("country", params.country);
  if (params.coverage_min !== undefined) qs.set("coverage_min", String(params.coverage_min));
  if (params.coverage_max !== undefined) qs.set("coverage_max", String(params.coverage_max));
  if (params.deadline_from) qs.set("deadline_from", params.deadline_from);
  if (params.deadline_to) qs.set("deadline_to", params.deadline_to);
  return qs.toString();
}

export const scholarshipsRealApi = {
  getScholarships: (params: ScholarshipListParams = {}): Promise<Paginated<Scholarship>> =>
    httpGet(`${BASE}?${toQuery(params)}`),
  createScholarship: (input: ScholarshipInput): Promise<Scholarship> => httpPost(BASE, input),
  updateScholarship: (id: number, input: Partial<ScholarshipInput>): Promise<Scholarship> =>
    httpPatch(`${BASE}/${id}`, input),
  deleteScholarship: (id: number): Promise<void> => httpDelete(`${BASE}/${id}`),
};
