import type { Course, PaginatedResponse } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Real extracted courses are far sparser than this (fees and images are NULL on
// every row today, duration on all but one). The first entries here carry full
// data so the card's populated state is visible; the last two are deliberately
// null-heavy to mirror what live data actually looks like.
const mockCourses: Course[] = [
  {
    id: "3f1a2b4c-0001-4a5b-8c6d-7e8f9a0b1c2d",
    job_id: "job-1",
    name: "Advanced Diploma of Business",
    short_name: "ADB",
    degree_level: "Diploma",
    subject_area: "Business",
    duration_weeks: 104,
    study_mode: "on-campus",
    country_code: "AU",
    domestic_fee_total: "2400.00",
    domestic_currency: "AUD",
    international_fee_total: "2700.00",
    international_currency: "AUD",
    awarding_institution: "Melbourne Business College",
    image_url: null,
    institution_name: "Melbourne Business College",
    institution_logo_url: null,
  },
  {
    id: "3f1a2b4c-0002-4a5b-8c6d-7e8f9a0b1c2d",
    job_id: "job-1",
    name: "Advanced Diploma Of Community Sector Management",
    short_name: null,
    degree_level: "Diploma",
    subject_area: "Community Services",
    duration_weeks: 78,
    study_mode: "hybrid",
    country_code: "AU",
    domestic_fee_total: "3100.00",
    domestic_currency: "AUD",
    international_fee_total: "3500.00",
    international_currency: "AUD",
    awarding_institution: "Melbourne Business College",
    image_url: null,
    institution_name: "Melbourne Business College",
    institution_logo_url: null,
  },
  {
    id: "3f1a2b4c-0003-4a5b-8c6d-7e8f9a0b1c2d",
    job_id: "job-2",
    name: "Advanced Diploma of Leadership and Management",
    short_name: "ADLM",
    degree_level: "Diploma",
    subject_area: "Management",
    duration_weeks: 52,
    study_mode: "online",
    country_code: "AU",
    domestic_fee_total: "2800.00",
    domestic_currency: "AUD",
    international_fee_total: "3000.00",
    international_currency: "AUD",
    awarding_institution: "Sydney Institute of Management",
    image_url: null,
    institution_name: "Sydney Institute of Management",
    institution_logo_url: null,
  },
  {
    id: "3f1a2b4c-0004-4a5b-8c6d-7e8f9a0b1c2d",
    job_id: "job-3",
    name: "Associate Degree in Agribusiness",
    short_name: null,
    degree_level: "Associate Degree",
    subject_area: "Agriculture",
    duration_weeks: 104,
    study_mode: "on-campus",
    country_code: "AU",
    domestic_fee_total: "14200.00",
    domestic_currency: "AUD",
    international_fee_total: "15750.00",
    international_currency: "AUD",
    awarding_institution: "University of New England",
    image_url: null,
    institution_name: "University of New England",
    institution_logo_url: null,
  },
  {
    id: "3f1a2b4c-0005-4a5b-8c6d-7e8f9a0b1c2d",
    job_id: "job-4",
    name: "Executive Master of Health Administration",
    short_name: "EMHA",
    degree_level: "Master",
    subject_area: "Medicine",
    duration_weeks: null,
    study_mode: "hybrid",
    country_code: null,
    domestic_fee_total: null,
    domestic_currency: null,
    international_fee_total: null,
    international_currency: null,
    awarding_institution: "Cornell University",
    image_url: null,
    institution_name: "Cornell University",
    institution_logo_url: null,
  },
  {
    id: "3f1a2b4c-0006-4a5b-8c6d-7e8f9a0b1c2d",
    job_id: "job-5",
    name: "BSc Computer Science",
    short_name: null,
    degree_level: null,
    subject_area: "Computer Science",
    duration_weeks: null,
    study_mode: null,
    country_code: null,
    domestic_fee_total: null,
    domestic_currency: null,
    international_fee_total: null,
    international_currency: null,
    awarding_institution: null,
    image_url: null,
    institution_name: null,
    institution_logo_url: null,
  },
];

export const coursesMockApi = {
  listCourses: async (page = 1, limit = 20): Promise<PaginatedResponse<Course>> => {
    console.log("[mock] GET /courses", { page, limit });
    await delay(300);
    const start = (page - 1) * limit;
    return {
      data: mockCourses.slice(start, start + limit),
      meta: {
        page,
        limit,
        total: mockCourses.length,
        totalPages: Math.ceil(mockCourses.length / limit),
      },
    };
  },
};
