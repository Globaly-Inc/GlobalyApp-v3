import type {
  CloseResult,
  CreditBalance,
  InboxItem,
  InboxItemShared,
  PaginatedResponse,
  UnlockResult,
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

function shared(id: number, over: Partial<InboxItemShared> = {}): InboxItemShared {
  return {
    id,
    enquiry_id: 1000 + id,
    status: "pending",
    enquiry_status: "pending",
    coin_cost: UNLOCK_COST,
    distance_km: null,
    preferred_intake: null,
    preferred_year: null,
    created_at: daysAgo(0),
    closed_at: null,
    close_reason: null,
    ...over,
  };
}

/**
 * A locked row.
 *
 * The real server omits the contact KEYS rather than nulling them, so the mock
 * must too — a mock that carries `student_email: null` would let a component
 * read a field the real API never sends and pass in mock mode only.
 */
function locked(id: number, preview: string, over: Partial<InboxItemShared> = {}): InboxItem {
  return {
    ...shared(id, over),
    unlocked: false,
    message_preview: preview,
    student: { first_name: "Priya", photo_url: null },
  };
}

function unlocked(id: number, message: string, over: Partial<InboxItemShared> = {}): InboxItem {
  return {
    ...shared(id, { status: "viewed", enquiry_status: "viewed", ...over }),
    unlocked: true,
    unlocked_at: daysAgo(1),
    credits_spent: UNLOCK_COST,
    message,
    service_id: null,
    student: {
      id: 42,
      first_name: "Priya",
      last_name: "Sharma",
      email: "priya.sharma@example.com",
      phone: "+61 400 111 222",
      photo_url: null,
      city_of_residence: "Sydney",
      nationality_id: null,
      country_of_residence_id: null,
    },
  };
}

// Covers every state a card can render — locked near/far/unmeasurable, unlocked
// with contact, and closed with a reason — and every summary counter.
let mockDistributions: InboxItem[] = [
  locked(1, "I'm interested in this course — could you advise on intake dates and Eng…", {
    distance_km: 4.2,
    preferred_intake: "January",
    preferred_year: 2027,
  }),
  locked(2, "Looking for a scholarship pathway into this programme. I already hold a…", {
    distance_km: 34.8,
    preferred_intake: "July",
    preferred_year: 2027,
    created_at: daysAgo(2),
  }),
  // No coordinates on one side, so no distance to show.
  locked(3, "Do you handle student visa applications as well as admissions?", {
    created_at: daysAgo(4),
  }),
  unlocked(4, "Do you handle student visa applications as well as admissions? I have already sat IELTS.", {
    distance_km: 11.5,
    preferred_intake: "March",
    preferred_year: 2027,
    created_at: daysAgo(1),
  }),
  unlocked(5, "Please send fee details for international students and the application checklist.", {
    status: "responded",
    enquiry_status: "responded",
    distance_km: 22,
    preferred_intake: "October",
    preferred_year: 2026,
    created_at: daysAgo(9),
  }),
  locked(6, "No longer pursuing study abroad this year.", {
    status: "closed",
    distance_km: 48,
    created_at: daysAgo(20),
    closed_at: daysAgo(3),
    close_reason: "Student is outside the regions we service.",
  }),
];

let mockBalance = 500;

const page = <T,>(data: T[]): PaginatedResponse<T> => ({
  data,
  meta: { page: 1, limit: 100, total: data.length, totalPages: 1 },
});

export const businessEnquiriesMockApi = {
  listDistributions: async (): Promise<PaginatedResponse<InboxItem>> => {
    console.log("[mock] GET /business/enquiries");
    await delay(200);
    return page(mockDistributions);
  },

  getCredits: async (): Promise<CreditBalance> => {
    console.log("[mock] GET /business/enquiries/credits");
    await delay(120);
    return { balance: mockBalance, unlock_cost: UNLOCK_COST };
  },

  unlock: async (id: number): Promise<UnlockResult> => {
    console.log("[mock] POST /business/enquiries/:id/unlock", { id });
    await delay(300);
    const target = mockDistributions.find((d) => d.id === id);
    if (!target) throw new Error("Enquiry not found in this inbox");

    if (target.unlocked) {
      return {
        unlocked: true,
        already_unlocked: true,
        credits_spent: target.credits_spent,
        balance: mockBalance,
        enquiry: target,
      };
    }
    if (mockBalance < target.coin_cost) {
      throw new Error(`Insufficient credits — unlocking costs ${target.coin_cost}`);
    }
    mockBalance -= target.coin_cost;

    // Closing does not re-lock a lead, and unlocking does not un-close one:
    // status is carried through rather than forced to 'viewed'.
    const revealed = unlocked(target.id, "Do you handle student visa applications as well as admissions?", {
      status: target.status === "closed" ? "closed" : "viewed",
      distance_km: target.distance_km,
      preferred_intake: target.preferred_intake,
      preferred_year: target.preferred_year,
      created_at: target.created_at,
      closed_at: target.closed_at,
      close_reason: target.close_reason,
      coin_cost: target.coin_cost,
    });
    mockDistributions = mockDistributions.map((d) => (d.id === id ? revealed : d));

    return {
      unlocked: true,
      already_unlocked: false,
      credits_spent: target.coin_cost,
      balance: mockBalance,
      enquiry: revealed,
    };
  },

  close: async (id: number, closeReason: string): Promise<CloseResult> => {
    console.log("[mock] POST /business/enquiries/:id/close", { id, closeReason });
    await delay(250);
    const target = mockDistributions.find((d) => d.id === id);
    if (!target) throw new Error("Enquiry not found in this inbox");

    // Idempotent, like the server: a second close reports the first one and
    // rewrites nothing.
    if (target.status === "closed") {
      return {
        id,
        status: "closed",
        already_closed: true,
        closed_at: target.closed_at,
        close_reason: target.close_reason,
      };
    }

    const closedAt = new Date().toISOString();
    mockDistributions = mockDistributions.map((d) =>
      d.id === id ? { ...d, status: "closed", closed_at: closedAt, close_reason: closeReason } : d,
    );
    return { id, status: "closed", already_closed: false, closed_at: closedAt, close_reason: closeReason };
  },
};
