import type { AiExtractionJob } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockJobs: AiExtractionJob[] = [
  {
    id: "ai-1",
    institution_name: "Auckland Institute of Studies",
    institution_url: "https://ais.ac.nz",
    status: "extracting",
    total_pages_found: 60,
    courses_extracted: 48,
    verification_score: 0,
    verification_total: 0,
    pages_scraped: 48,
    pages_failed: 0,
    created_at: "2026-08-07T02:00:00Z",
    updated_at: "2026-08-13T06:00:00Z",
    pipeline_progress: {
      mapping: { status: "done", total: 60, done: 60 },
      intelligence: { status: "done", total: 1, done: 1 },
      scraping: { status: "done", total: 60, done: 48 },
      extracting: { status: "processing", total: 48, done: 32 },
    },
  },
  {
    id: "ai-2",
    institution_name: "RMIT University",
    institution_url: "https://www.rmit.edu.au",
    status: "pending",
    total_pages_found: 200,
    courses_extracted: 0,
    verification_score: 0,
    verification_total: 0,
    pages_scraped: 0,
    pages_failed: 0,
    created_at: "2026-08-13T02:30:00Z",
    updated_at: "2026-08-13T02:30:00Z",
    pipeline_progress: null,
  },
  {
    id: "ai-3",
    institution_name: "Sheridan College",
    institution_url: "https://sheridancollege.ca",
    status: "review",
    total_pages_found: 110,
    courses_extracted: 96,
    verification_score: 90,
    verification_total: 96,
    pages_scraped: 110,
    pages_failed: 1,
    created_at: "2026-08-10T09:00:00Z",
    updated_at: "2026-08-12T14:00:00Z",
    pipeline_progress: {
      mapping: { status: "done", total: 110, done: 110 },
      intelligence: { status: "done", total: 1, done: 1 },
      scraping: { status: "done", total: 110, done: 110 },
      extracting: { status: "done", total: 96, done: 96 },
      verifying: { status: "done", total: 96, done: 90 },
    },
  },
  {
    id: "ai-4",
    institution_name: "Monash University",
    institution_url: "https://www.monash.edu",
    status: "mapping",
    total_pages_found: 0,
    courses_extracted: 0,
    verification_score: 0,
    verification_total: 0,
    pages_scraped: 0,
    pages_failed: 0,
    created_at: "2026-08-13T08:00:00Z",
    updated_at: "2026-08-13T08:05:00Z",
    pipeline_progress: {
      mapping: { status: "processing", total: 0, done: 0 },
    },
  },
  {
    id: "ai-5",
    institution_name: "University of Melbourne",
    institution_url: "https://www.unimelb.edu.au",
    status: "failed",
    total_pages_found: 45,
    courses_extracted: 12,
    verification_score: 0,
    verification_total: 0,
    pages_scraped: 30,
    pages_failed: 15,
    created_at: "2026-08-11T03:00:00Z",
    updated_at: "2026-08-12T01:00:00Z",
    pipeline_progress: {
      mapping: { status: "done", total: 45, done: 45 },
      intelligence: { status: "done", total: 1, done: 1 },
      scraping: { status: "done", total: 45, done: 30 },
      extracting: { status: "done", total: 30, done: 12 },
    },
  },
  {
    id: "ai-6",
    institution_name: "Crandall University",
    institution_url: "https://www.crandallu.ca",
    status: "paused",
    total_pages_found: 25,
    courses_extracted: 8,
    verification_score: 0,
    verification_total: 0,
    pages_scraped: 15,
    pages_failed: 0,
    created_at: "2026-08-09T06:00:00Z",
    updated_at: "2026-08-11T10:00:00Z",
    pipeline_progress: {
      mapping: { status: "done", total: 25, done: 25 },
      intelligence: { status: "done", total: 1, done: 1 },
      scraping: { status: "done", total: 25, done: 15 },
      extracting: { status: "processing", total: 15, done: 8 },
    },
  },
];

export const aiExtractionMockApi = {
  getInProgressJobs: async (): Promise<AiExtractionJob[]> => {
    console.log("[mock] GET /admin/data-extraction/jobs-filtered (ai-extraction)");
    await delay(300);
    return mockJobs;
  },

  pauseJob: async (id: string): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/jobs/" + id + "/pause");
    await delay(200);
    mockJobs = mockJobs.map((j) => (j.id === id ? { ...j, status: "paused" } : j));
  },

  resumeJob: async (id: string): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/jobs/" + id + "/resume");
    await delay(200);
    mockJobs = mockJobs.map((j) => (j.id === id ? { ...j, status: "extracting" } : j));
  },

  deleteJob: async (id: string): Promise<void> => {
    console.log("[mock] DELETE /admin/data-extraction/jobs/" + id);
    await delay(200);
    mockJobs = mockJobs.filter((j) => j.id !== id);
  },

  declineJob: async (id: string): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/jobs/" + id + "/decline");
    await delay(200);
    mockJobs = mockJobs.map((j) => (j.id === id ? { ...j, status: "declined" } : j));
  },
};
