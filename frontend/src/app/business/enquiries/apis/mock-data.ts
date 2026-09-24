import { INBOX_PAGE_SIZE } from "../const";
import type {
  CloseResult,
  CreditBalance,
  DistributionListItem,
  DistributionListParams,
  DistributionListResult,
  UnlockResult,
  UnlockedStudentProfile,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const UNLOCK_COST = 30;

/** Defaults for a locked row. Locked rows carry a teaser and no contact, mirroring
 * what the server actually sends — the real API truncates before responding, so the
 * mock must too rather than holding the full text client-side. */
function row(over: Partial<DistributionListItem>): DistributionListItem {
  return {
    enquiry_id: "enq",
    distribution_id: "dist",
    status: "distributed",
    tier: 1,
    match_rank: 1,
    message: null,
    message_truncated: false,
    // Withheld while locked, like the contact fields — see DistributionListItem.
    eligibility_criteria: null,
    student_phone_withheld: false,
    preferred_intake: null,
    preferred_year: null,
    course_name: null,
    course_short_name: null,
    institution_name: null,
    created_at: daysAgo(0),
    accept_count: 0,
    max_accepts: 3,
    eligibility_status: null,
    is_unlocked: false,
    coin_cost: 0,
    unlocked_at: null,
    closed_at: null,
    close_reason: null,
    // Present on locked rows too — the first name is what the card shows before unlock.
    student_first_name: "Alex",
    student_photo_url: null,
    student_name: null,
    student_email: null,
    student_phone: null,
    ...over,
  };
}

// Covers every state a card can render — locked, unlocked with contact, closed with
// a reason — and every summary counter.
let mockDistributions: DistributionListItem[] = [
  row({
    enquiry_id: "enq-1",
    distribution_id: "dist-1",
    message: "I'm interested in this course — could you advise on intake dates and Eng…",
    message_truncated: true,
    preferred_intake: "January",
    preferred_year: 2027,
    course_name: "Bachelor of Computer Science",
    course_short_name: "BCompSc",
    institution_name: "University of Sydney",
  }),
  row({
    enquiry_id: "enq-2",
    distribution_id: "dist-2",
    tier: 2,
    match_rank: 3,
    message: "Looking for a scholarship pathway into this programme. I already hold a…",
    message_truncated: true,
    preferred_intake: "July",
    preferred_year: 2027,
    course_name: "Master of Information Technology",
    course_short_name: "MIT",
    institution_name: "University of Melbourne",
    created_at: daysAgo(2),
  }),
  row({
    enquiry_id: "enq-3",
    distribution_id: "dist-3",
    status: "unlocked",
    message: "Do you handle student visa applications as well as admissions? I have already sat IELTS.",
    course_name: "Master of Data Science",
    course_short_name: "MDS",
    institution_name: "University of Technology Sydney",
    preferred_intake: "March",
    preferred_year: 2027,
    created_at: daysAgo(1),
    accept_count: 1,
    eligibility_status: "eligible",
    is_unlocked: true,
    coin_cost: UNLOCK_COST,
    unlocked_at: daysAgo(1),
    student_first_name: "Priya",
    student_photo_url: null,
    student_name: "Priya Sharma",
    student_email: "priya.sharma@example.com",
    student_phone: "+61 400 111 222",
  }),
  row({
    enquiry_id: "enq-4",
    distribution_id: "dist-4",
    status: "converted",
    match_rank: 2,
    message: "Please send fee details for international students and the application checklist.",
    course_name: "Diploma of Business Administration",
    institution_name: "RMIT University",
    preferred_intake: "October",
    preferred_year: 2026,
    created_at: daysAgo(9),
    accept_count: 2,
    eligibility_status: "not_eligible",
    is_unlocked: true,
    coin_cost: UNLOCK_COST,
    unlocked_at: daysAgo(8),
    student_first_name: "Daniel",
    student_photo_url: null,
    student_name: "Daniel Okafor",
    student_email: "daniel.okafor@example.com",
    student_phone: "+61 400 333 444",
  }),
  row({
    enquiry_id: "enq-5",
    distribution_id: "dist-5",
    status: "closed",
    tier: 3,
    match_rank: 4,
    message: "No longer pursuing study abroad this year.",
    course_name: "Graduate Diploma of Education",
    institution_name: "Deakin University",
    created_at: daysAgo(20),
    closed_at: daysAgo(3),
    close_reason: "Student is outside the regions we service.",
  }),
  row({
    enquiry_id: "enq-6",
    distribution_id: "dist-6",
    status: "expired",
    tier: 4,
    match_rank: 5,
    course_name: "Certificate IV in Nursing",
    course_short_name: "CertIV",
    created_at: daysAgo(31),
  }),
];

let mockBalance = 500;

export const businessEnquiriesMockApi = {
  listDistributions: async (params: DistributionListParams = {}): Promise<DistributionListResult> => {
    console.log("[mock] GET /enquiry-distributions", params);
    await delay(300);
    // Filtered, counted and paged like the server, so mock mode is not a different product.
    const term = params.search?.trim().toLowerCase();
    const matched = term
      ? mockDistributions.filter((d) =>
          // student_first_name, not student_name: the latter is null on locked rows.
          [d.course_name, d.course_short_name, d.institution_name, d.student_first_name, d.message].some(
            (v) => typeof v === "string" && v.toLowerCase().includes(term),
          ),
        )
      : mockDistributions;
    const counts = matched.reduce<Record<string, number>>((acc, d) => {
      acc[d.status] = (acc[d.status] ?? 0) + 1;
      return acc;
    }, {});
    const wanted = params.status?.split(",").map((v) => v.trim()).filter(Boolean);
    const inStatus = wanted?.length ? matched.filter((d) => wanted.includes(d.status)) : matched;
    const page = params.page ?? 1;
    const limit = params.limit ?? INBOX_PAGE_SIZE;
    const start = (page - 1) * limit;
    return {
      data: inStatus.slice(start, start + limit),
      meta: { page, limit, total: inStatus.length, totalPages: Math.max(1, Math.ceil(inStatus.length / limit)) },
      counts,
    };
  },

  getCredits: async (): Promise<CreditBalance> => {
    console.log("[mock] GET /enquiry-distributions/credits");
    await delay(120);
    return { balance: mockBalance, unlock_cost: UNLOCK_COST };
  },

  getStudentProfile: async (id: string): Promise<UnlockedStudentProfile> => {
    console.log("[mock] GET /enquiry-distributions/:id/student-profile", { id });
    await delay(300);
    const target = mockDistributions.find((d) => d.distribution_id === id);
    if (!target) throw new Error("Enquiry not found");
    // Mirrors the server's paywall so the mock cannot make an un-unlocked read look legal.
    if (!target.is_unlocked) throw new Error("Unlock this enquiry to view the student's profile");
    return {
      first_name: "Mock",
      last_name: "Student",
      email: target.student_email,
      phone: target.student_phone,
      phone_withheld: target.student_phone_withheld,
      photo_url: null,
      cover_url: null,
      profile: { city_of_residence: "Sydney", date_of_birth: "2001-04-12", gender: "female" },
      qualifications: [
        {
          id: "q1",
          qualification_type: "bachelor",
          degree_title: "BSc Computer Science",
          subject_area: "Computer Science & IT",
          institution_name: "Mock University",
          grading_system: "gpa_4",
          grade_value: "3.4",
          is_current: false,
          start_date: "2019-02-01",
          end_date: "2022-11-30",
          sort_order: 0,
        },
      ],
      language_tests: [
        {
          id: "l1",
          test_status: "completed",
          test_type: "IELTS Academic",
          overall_score: "7.0",
          test_date: "2024-06-01",
          sub_scores: { listening: "7.5", reading: "7.0", writing: "6.5", speaking: "7.0" },
          sort_order: 0,
        },
      ],
      academic_tests: [],
      work_experiences: [
        {
          id: "w1",
          job_title: "Junior Developer",
          organization_name: "Mock Systems",
          is_current: true,
          start_date: "2023-01-15",
          end_date: null,
          sort_order: 0,
        },
      ],
    };
  },

  unlock: async (id: string): Promise<UnlockResult> => {
    console.log("[mock] POST /enquiry-distributions/:id/unlock", { id });
    await delay(300);
    const target = mockDistributions.find((d) => d.distribution_id === id);
    if (!target) throw new Error("Enquiry not found");

    if (target.is_unlocked) {
      return {
        distribution_id: id,
        status: "unlocked",
        already_unlocked: true,
        coin_cost: target.coin_cost,
        credits_remaining: mockBalance,
        student_first_name: target.student_first_name,
        student_last_name: target.student_name?.split(" ").slice(1).join(" ") ?? null,
        student_email: target.student_email,
        student_phone: target.student_phone,
        student_phone_withheld: target.student_phone_withheld,
      };
    }
    if (target.closed_at) throw new Error("This enquiry is closed and can no longer be unlocked");
    if (mockBalance < UNLOCK_COST) throw new Error(`Insufficient credits — unlocking costs ${UNLOCK_COST}`);
    mockBalance -= UNLOCK_COST;

    const student = { first: "Mock", last: "Student", email: "mock.student@example.com", phone: "+61 400 000 000" };
    mockDistributions = mockDistributions.map((d) =>
      d.distribution_id === id
        ? {
            ...d,
            status: "unlocked",
            is_unlocked: true,
            accept_count: d.accept_count + 1,
            coin_cost: UNLOCK_COST,
            unlocked_at: new Date().toISOString(),
            message_truncated: false,
            student_first_name: student.first,
            student_name: `${student.first} ${student.last}`,
            student_email: student.email,
            student_phone: student.phone,
          }
        : d,
    );

    return {
      distribution_id: id,
      status: "unlocked",
      already_unlocked: false,
      coin_cost: UNLOCK_COST,
      credits_remaining: mockBalance,
      student_first_name: student.first,
      student_last_name: student.last,
      student_email: student.email,
      student_phone: student.phone,
      // The mock student consented; flip both of these to exercise the withheld path.
      student_phone_withheld: false,
    };
  },



  close: async (id: string, closeReason: string): Promise<CloseResult> => {
    console.log("[mock] POST /enquiry-distributions/:id/close", { id, closeReason });
    await delay(250);
    const target = mockDistributions.find((d) => d.distribution_id === id);
    if (!target) throw new Error("Enquiry not found");
    if (target.closed_at) throw new Error("This enquiry is already closed");

    const closedAt = new Date().toISOString();
    mockDistributions = mockDistributions.map((d) =>
      d.distribution_id === id ? { ...d, status: "closed", closed_at: closedAt, close_reason: closeReason } : d,
    );
    return { distribution_id: id, status: "closed", close_reason: closeReason, closed_at: closedAt };
  },
};
