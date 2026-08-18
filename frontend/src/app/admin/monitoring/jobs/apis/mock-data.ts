// Offline fixture, selected only when NEXT_PUBLIC_MOCK_DATA=true. Same method
// names and same shapes as real-api.ts, so the view cannot tell them apart.

import type { AdminJob, AdminJobStats, ListJobsParams, Paginated } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockJobs: AdminJob[] = [
  {
    id: 1,
    business_id: 12,
    title: "Weekend Barista",
    slug: "weekend-barista-a1b2c3d4",
    status: "open",
    job_type: "part_time",
    category: "hospitality",
    location_city: "Sydney",
    country_name: "Australia",
    is_remote: false,
    is_hybrid: false,
    pay_min: 28,
    pay_max: 34,
    pay_currency: "AUD",
    pay_unit: "hour",
    views_count: 412,
    applications_count: 17,
    is_featured: true,
    published_at: "2026-08-10T02:00:00.000Z",
    closing_at: "2026-09-30T14:00:00.000Z",
    created_at: "2026-08-09T23:40:00.000Z",
    business_name: "Corner Lane Coffee",
    company_name: null,
    logo_url: null,
  },
  {
    id: 2,
    business_id: 31,
    title: "Junior Front-End Developer",
    slug: "junior-front-end-developer-9f8e7d6c",
    status: "open",
    job_type: "full_time",
    category: "it",
    location_city: "Melbourne",
    country_name: "Australia",
    is_remote: true,
    is_hybrid: true,
    pay_min: 68000,
    pay_max: 82000,
    pay_currency: "AUD",
    pay_unit: "year",
    views_count: 1980,
    applications_count: 64,
    is_featured: false,
    published_at: "2026-08-01T09:15:00.000Z",
    closing_at: null,
    created_at: "2026-07-31T22:05:00.000Z",
    business_name: "Northline Digital",
    company_name: null,
    logo_url: null,
  },
  {
    id: 3,
    business_id: 12,
    title: "Kitchen Hand",
    slug: "kitchen-hand-5a4b3c2d",
    status: "draft",
    job_type: "casual",
    category: "hospitality",
    location_city: "Sydney",
    country_name: "Australia",
    is_remote: false,
    is_hybrid: false,
    pay_min: 26,
    pay_max: null,
    pay_currency: "AUD",
    pay_unit: "hour",
    views_count: 0,
    applications_count: 0,
    is_featured: false,
    published_at: null,
    closing_at: null,
    created_at: "2026-08-16T05:20:00.000Z",
    business_name: "Corner Lane Coffee",
    company_name: null,
    logo_url: null,
  },
  {
    id: 4,
    business_id: null,
    title: "Campus Ambassador",
    slug: "campus-ambassador-77aa88bb",
    status: "closed",
    job_type: "internship",
    category: "marketing",
    location_city: "Brisbane",
    country_name: "Australia",
    is_remote: false,
    is_hybrid: false,
    pay_min: null,
    pay_max: null,
    pay_currency: null,
    pay_unit: null,
    views_count: 640,
    applications_count: 23,
    is_featured: false,
    published_at: "2026-06-02T00:00:00.000Z",
    closing_at: "2026-07-15T00:00:00.000Z",
    created_at: "2026-06-01T21:10:00.000Z",
    business_name: null,
    company_name: "Southbank Student Union",
    logo_url: null,
  },
];

const mockStats: AdminJobStats = {
  jobs: { total: 4, draft: 1, open: 2, closed: 1, expired: 0 },
  applications: { total: 104, last_7_days: 19 },
};

export const adminJobsMockApi = {
  getJobs: async (params: ListJobsParams = {}): Promise<Paginated<AdminJob>> => {
    await delay(200);
    const data = mockJobs.filter(
      (job) =>
        (!params.status || job.status === params.status) &&
        (!params.business_id || job.business_id === params.business_id) &&
        (!params.job_type || job.job_type === params.job_type) &&
        (!params.category || job.category === params.category) &&
        (!params.q || job.title.toLowerCase().includes(params.q.toLowerCase())),
    );
    const limit = params.limit ?? 20;
    return {
      data,
      meta: {
        page: params.page ?? 1,
        limit,
        total: data.length,
        totalPages: Math.max(1, Math.ceil(data.length / limit)),
      },
    };
  },

  getStats: async (): Promise<AdminJobStats> => {
    await delay(200);
    return mockStats;
  },
};
