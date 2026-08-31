import type { CloseResult, CreditBalance, DistributionListItem, UnlockResult } from "./types";

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
  listDistributions: async (): Promise<{ data: DistributionListItem[] }> => {
    console.log("[mock] GET /enquiry-distributions");
    await delay(200);
    return { data: mockDistributions };
  },

  getCredits: async (): Promise<CreditBalance> => {
    console.log("[mock] GET /enquiry-distributions/credits");
    await delay(120);
    return { balance: mockBalance, unlock_cost: UNLOCK_COST };
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
        student_first_name: target.student_name?.split(" ")[0] ?? null,
        student_last_name: target.student_name?.split(" ").slice(1).join(" ") ?? null,
        student_email: target.student_email,
        student_phone: target.student_phone,
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
