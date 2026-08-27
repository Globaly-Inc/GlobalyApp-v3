import type {
  AdminEnquiry,
  AdminEnquiryDetail,
  AdminEnquiryDistribution,
  AdminEnquiryStats,
  EnquiryListParams,
  Paginated,
} from "./types";

const delay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

const ENQUIRIES: AdminEnquiry[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    status: "in_conversation",
    created_at: "2026-08-24T09:12:00.000Z",
    preferred_intake: "February",
    preferred_year: 2027,
    accept_count: 2,
    max_accepts: 3,
    last_distributed_at: "2026-08-24T09:14:00.000Z",
    course_name: "Master of Data Science",
    institution_name: "University of Melbourne",
    student_id: 41,
    student_name: "Aarav Sharma",
    student_email: "aarav.sharma@globaly.test",
    recipients: 4,
    unlocked_count: 2,
    coins_spent: 60,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    status: "distributed",
    created_at: "2026-08-23T14:40:00.000Z",
    preferred_intake: "September",
    preferred_year: 2027,
    accept_count: 0,
    max_accepts: 3,
    last_distributed_at: "2026-08-23T14:41:00.000Z",
    course_name: "BSc Computer Science",
    institution_name: "University of Leeds",
    student_id: 42,
    student_name: "Mei Lin",
    student_email: "mei.lin@globaly.test",
    recipients: 3,
    unlocked_count: 0,
    coins_spent: 0,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    status: "converted",
    created_at: "2026-08-18T08:05:00.000Z",
    preferred_intake: "January",
    preferred_year: 2027,
    accept_count: 1,
    max_accepts: 3,
    last_distributed_at: "2026-08-18T08:07:00.000Z",
    course_name: "MBA (Full-time)",
    institution_name: "Trinity College Dublin",
    student_id: 43,
    student_name: "Daniel Okoro",
    student_email: "daniel.okoro@globaly.test",
    recipients: 5,
    unlocked_count: 3,
    coins_spent: 90,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    status: "no_match",
    created_at: "2026-08-16T11:20:00.000Z",
    preferred_intake: null,
    preferred_year: null,
    accept_count: 0,
    max_accepts: 3,
    last_distributed_at: null,
    course_name: "Diploma of Viticulture",
    institution_name: null,
    student_id: 44,
    student_name: "Sofia Alvarez",
    student_email: "sofia.alvarez@globaly.test",
    recipients: 0,
    unlocked_count: 0,
    coins_spent: 0,
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    status: "expired",
    created_at: "2026-07-29T16:00:00.000Z",
    preferred_intake: "February",
    preferred_year: 2027,
    accept_count: 0,
    max_accepts: 3,
    last_distributed_at: "2026-07-29T16:02:00.000Z",
    course_name: "Master of Nursing",
    institution_name: "University of Auckland",
    student_id: 45,
    student_name: "Ravi Patel",
    student_email: "ravi.patel@globaly.test",
    recipients: 2,
    unlocked_count: 0,
    coins_spent: 0,
  },
];

const DISTRIBUTIONS: Record<string, AdminEnquiryDistribution[]> = {
  "11111111-1111-4111-8111-111111111111": [
    {
      id: "aaaa1111-1111-4111-8111-111111111111",
      business_id: 7,
      business_name: "Globaly Education Consultants",
      recipient_kind: "business",
      city: "Melbourne",
      tier: 1,
      match_rank: 1,
      match_distance_km: 3.2,
      status: "in_conversation",
      coin_cost: 30,
      unlocked_at: "2026-08-24T10:02:00.000Z",
      closed_at: null,
      close_reason: null,
      created_at: "2026-08-24T09:14:00.000Z",
    },
    {
      id: "aaaa2222-2222-4222-8222-222222222222",
      business_id: 12,
      business_name: "Southern Cross Migration",
      recipient_kind: "business",
      city: "Sydney",
      tier: 2,
      match_rank: 2,
      match_distance_km: 712.4,
      status: "unlocked",
      coin_cost: 30,
      unlocked_at: "2026-08-24T12:30:00.000Z",
      closed_at: null,
      close_reason: null,
      created_at: "2026-08-24T09:14:00.000Z",
    },
    {
      id: "aaaa3333-3333-4333-8333-333333333333",
      business_id: 19,
      business_name: "Kathmandu Study Abroad",
      recipient_kind: "business",
      city: "Kathmandu",
      tier: 3,
      match_rank: 3,
      match_distance_km: null,
      status: "closed",
      coin_cost: 0,
      unlocked_at: null,
      closed_at: "2026-08-25T04:10:00.000Z",
      close_reason: "No counsellor available for this intake.",
      created_at: "2026-08-24T09:14:00.000Z",
    },
    {
      id: "aaaa4444-4444-4444-8444-444444444444",
      business_id: 24,
      business_name: "Pacific Pathways",
      recipient_kind: "institution",
      city: "Auckland",
      tier: 4,
      match_rank: 4,
      match_distance_km: null,
      status: "distributed",
      coin_cost: 0,
      unlocked_at: null,
      closed_at: null,
      close_reason: null,
      created_at: "2026-08-24T09:14:00.000Z",
    },
  ],
};

function detailFor(enquiry: AdminEnquiry): AdminEnquiryDetail {
  return {
    ...enquiry,
    message:
      "I'm looking at this course for the coming intake and I'd like help with the application, " +
      "the English requirement, and whether my current diploma counts towards credit transfer.",
    student_country_code: "NP",
    distribution_count: enquiry.recipients,
    closed_at: null,
    close_reason: null,
    course_short_name: null,
    target_business_name: null,
    distributions: DISTRIBUTIONS[enquiry.id] ?? [],
  };
}

export const adminEnquiriesMockApi = {
  getStats: async (): Promise<AdminEnquiryStats> => {
    console.log("[mock] GET /admin/monitoring/enquiries/stats");
    await delay();
    const statuses = Object.entries(
      ENQUIRIES.reduce<Record<string, number>>((acc, e) => {
        acc[e.status] = (acc[e.status] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([status, count]) => ({ status, count }));
    return {
      statuses,
      total: ENQUIRIES.length,
      distributions: {
        total: ENQUIRIES.reduce((sum, e) => sum + e.recipients, 0),
        unlocked: ENQUIRIES.reduce((sum, e) => sum + e.unlocked_count, 0),
        coins_spent: ENQUIRIES.reduce((sum, e) => sum + e.coins_spent, 0),
      },
    };
  },

  getEnquiries: async (params: EnquiryListParams = {}): Promise<Paginated<AdminEnquiry>> => {
    console.log("[mock] GET /admin/monitoring/enquiries", params);
    await delay();
    const term = params.search?.trim().toLowerCase();
    const statuses = params.status?.split(",").filter(Boolean);
    const data = ENQUIRIES.filter((e) => {
      if (statuses?.length && !statuses.includes(e.status)) return false;
      if (!term) return true;
      return [e.student_name, e.student_email, e.course_name, e.institution_name ?? ""].some((v) =>
        v.toLowerCase().includes(term),
      );
    });
    return { data, meta: { page: 1, limit: 20, total: data.length, totalPages: 1 } };
  },

  getEnquiry: async (id: string): Promise<AdminEnquiryDetail> => {
    console.log("[mock] GET /admin/monitoring/enquiries/:id", id);
    await delay();
    const enquiry = ENQUIRIES.find((e) => e.id === id);
    if (!enquiry) throw new Error("Enquiry not found");
    return detailFor(enquiry);
  },
};
