import type {
  CreateEnquiryInput,
  CreateEnquiryResult,
  Enquiry,
  EnquiryListItem,
  PaginatedResponse,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockEnquiries = new Map<number, Enquiry>();
let nextId = 1;

function seed(over: Partial<Enquiry>): Enquiry {
  const id = nextId++;
  const now = new Date().toISOString();
  const enquiry: Enquiry = {
    id,
    student_id: 1,
    status: "pending",
    message: "I'm interested in this course, please advise on intake dates.",
    preferred_intake: null,
    preferred_year: null,
    course_id: null,
    service_id: null,
    target_org_type: null,
    target_org_id: null,
    agent_business_id: null,
    assigned_to: null,
    distributed_at: null,
    converted_at: null,
    created_at: now,
    updated_at: now,
    unlocked_by_count: 0,
    course_name: null,
    course_short_name: null,
    institution_name: null,
    institution_logo_url: null,
    ...over,
  };
  mockEnquiries.set(id, enquiry);
  return enquiry;
}

seed({
  status: "viewed",
  course_id: "3f1c1a5e-0000-4000-8000-000000000001",
  course_name: "Mock Bachelor of Computer Science",
  course_short_name: "BCompSc",
  institution_name: "Mock Institution",
  preferred_intake: "March",
  preferred_year: 2027,
  distributed_at: new Date().toISOString(),
  unlocked_by_count: 1,
});

// A course the extraction tail merged away: the enquiry survives with no labels.
seed({
  status: "pending",
  course_id: "3f1c1a5e-0000-4000-8000-00000000dead",
  message: "Do you handle student visa applications as well as admissions?",
});

export const enquiriesMockApi = {
  createEnquiry: async (input: CreateEnquiryInput): Promise<CreateEnquiryResult> => {
    console.log("[mock] POST /enquiries", input);
    await delay(300);
    const created = seed({
      course_id: input.course_id,
      course_name: `Mock Course ${input.course_id.slice(0, 8)}`,
      institution_name: "Mock Institution",
      message: input.message,
      preferred_intake: input.preferred_intake ?? null,
      preferred_year: input.preferred_year ?? null,
      distributed_at: new Date().toISOString(),
    });
    // Create and distribute are one call on the real API, so the mock answers
    // with the fan-out too rather than with the enquiry row.
    return {
      id: created.id,
      status: created.status,
      created_at: created.created_at,
      distributed_to: 2,
      recipients: [
        { business_id: 11, coin_cost: 30, distance_km: 4.2 },
        { business_id: 12, coin_cost: 30, distance_km: 18.7 },
      ],
    };
  },

  getEnquiry: async (id: string): Promise<Enquiry> => {
    console.log("[mock] GET /enquiries/", id);
    await delay(200);
    const found = mockEnquiries.get(Number(id));
    if (!found) throw new Error("Enquiry not found");
    return found;
  },

  listEnquiries: async (): Promise<PaginatedResponse<EnquiryListItem>> => {
    console.log("[mock] GET /enquiries");
    await delay(200);
    const data: EnquiryListItem[] = [...mockEnquiries.values()]
      .sort((a, b) => b.id - a.id)
      .map((e) => ({
        id: e.id,
        status: e.status,
        message: e.message,
        preferred_intake: e.preferred_intake,
        preferred_year: e.preferred_year,
        course_id: e.course_id,
        service_id: e.service_id,
        distributed_at: e.distributed_at,
        created_at: e.created_at,
        distributed_to: e.distributed_at ? 2 : 0,
        unlocked_by_count: e.unlocked_by_count,
        course_name: e.course_name,
        course_short_name: e.course_short_name,
        institution_name: e.institution_name,
        institution_logo_url: e.institution_logo_url,
      }));
    return { data, meta: { page: 1, limit: 100, total: data.length, totalPages: 1 } };
  },
};
