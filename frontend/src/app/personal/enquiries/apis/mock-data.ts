import type { CreateEnquiryInput, Enquiry, EnquiryListItem, PaginatedResponse } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockEnquiries = new Map<string, Enquiry>();

mockEnquiries.set("enq-2", {
  id: "enq-2",
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

export const enquiriesMockApi = {
  createEnquiry: async (input: CreateEnquiryInput): Promise<Enquiry> => {
    console.log("[mock] POST /enquiries", input);
    await delay(300);
    const enquiry: Enquiry = {
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
