import type { Course, CreateEnquiryInput, Enquiry, EnquiryListItem, PaginatedResponse } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockEnquiries = new Map<string, Enquiry>();

mockEnquiries.set("enq-2", {
  id: "enq-2",
  unlocked_businesses: [
    {
      distribution_id: "dist-mock-1",
      business_id: 1,
      business_name: "Sydney Study Agents",
      logo_url: null,
      city: "Sydney",
      unlocked_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      is_closed: false,
    },
    {
      distribution_id: "dist-mock-2",
      business_id: 2,
      business_name: "Parramatta Education",
      logo_url: null,
      city: "Parramatta",
      unlocked_at: new Date(Date.now() - 86400000).toISOString(),
      is_closed: true,
    },
  ],
  student_id: 1,
  course_id: "course-2",
  extraction_job_id: null,
  institution_id: null,
  course_name: "Mock Bachelor of Computer Science",
  course_short_name: "BCompSc",
  institution_name: "Mock Institution",
  institution_logo_url: null,
  business_id: null,
  message: "I'm interested in this course, please advise on intake dates.",
  preferred_intake: "Fall",
  preferred_year: 2027,
  status: "distributed",
  max_accepts: 3,
  accept_count: 0,
  distribution_count: 1,
  last_distributed_at: new Date().toISOString(),
  closed_at: null,
  close_reason: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

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

export const enquiriesMockApi = {
  listCourses: async (page = 1, limit = 20) => {
    console.log("[mock] GET /courses", { page, limit });
    await delay(300);
    const start = (page - 1) * limit;
    return {
      data: mockCourses.slice(start, start + limit),
      meta: { page, limit, total: mockCourses.length, totalPages: Math.ceil(mockCourses.length / limit) },
    };
  },

  createEnquiry: async (input: CreateEnquiryInput): Promise<Enquiry> => {
    console.log("[mock] POST /enquiries", input);
    await delay(300);
    const enquiry: Enquiry = {
      // Nothing has unlocked a brand-new enquiry yet.
      unlocked_businesses: [],
      id: `enq-${mockEnquiries.size + 1}`,
      student_id: 1,
      course_id: input.course_id,
      extraction_job_id: input.extraction_job_id ?? null,
      // Real API derives this from the course's job; mock has no course fixture.
      institution_id: null,
      course_name: `Mock Course ${input.course_id.slice(0, 8)}`,
      course_short_name: null,
      institution_name: "Mock Institution",
      institution_logo_url: null,
      business_id: input.business_id ?? null,
      message: input.message,
      preferred_intake: input.preferred_intake ?? null,
      preferred_year: input.preferred_year ?? null,
      status: "pending",
      max_accepts: 3,
      accept_count: 0,
      distribution_count: 0,
      last_distributed_at: null,
      closed_at: null,
      close_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockEnquiries.set(enquiry.id, enquiry);
    return enquiry;
  },
  getEnquiry: async (id: string): Promise<Enquiry> => {
    console.log("[mock] GET /enquiries/", id);
    await delay(200);
    const found = mockEnquiries.get(id);
    if (!found) throw new Error("Enquiry not found");
    return found;
  },
  listEnquiries: async (): Promise<PaginatedResponse<EnquiryListItem>> => {
    console.log("[mock] GET /enquiries");
    await delay(200);
    const data: EnquiryListItem[] = [...mockEnquiries.values()]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((e) => ({
        id: e.id,
        status: e.status,
        created_at: e.created_at,
        preferred_intake: e.preferred_intake,
        preferred_year: e.preferred_year,
        course_name: `Mock Course ${e.course_id.slice(0, 8)}`,
        course_short_name: null,
        institution_name: "Mock Institution",
        institution_logo_url: null,
      }));
    return { data, meta: { page: 1, limit: 100, total: data.length, totalPages: 1 } };
  },
};
