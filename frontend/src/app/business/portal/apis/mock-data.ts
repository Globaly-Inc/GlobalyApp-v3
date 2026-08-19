import type { BusinessDashboard, InboxItem } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/** Both sides of the paywall, so the mock exercises the locked branch too. */
const RECENT: InboxItem[] = [
  {
    id: 501,
    enquiry_id: 9001,
    status: "pending",
    enquiry_status: "pending",
    coin_cost: 30,
    distance_km: 12.4,
    preferred_intake: "February",
    preferred_year: 2027,
    created_at: daysAgo(0),
    closed_at: null,
    close_reason: null,
    unlocked: false,
    message_preview: "Looking for help with a Master of Data Science application for next intake",
    student: { first_name: "Priya", photo_url: null },
  },
  {
    id: 502,
    enquiry_id: 9002,
    status: "viewed",
    enquiry_status: "viewed",
    coin_cost: 30,
    distance_km: null,
    preferred_intake: null,
    preferred_year: null,
    created_at: daysAgo(3),
    closed_at: null,
    close_reason: null,
    unlocked: true,
    unlocked_at: daysAgo(2),
    credits_spent: 30,
    message: "I have an offer already and need help with the student visa paperwork.",
    service_id: null,
    student: {
      id: 77,
      first_name: "Marco",
      last_name: "Rossi",
      email: "marco@example.test",
      phone: "+61 400 000 000",
      photo_url: null,
      city_of_residence: "Melbourne",
      nationality_id: null,
      country_of_residence_id: null,
    },
  },
];

const DASHBOARD: BusinessDashboard = {
  business: {
    id: 1,
    business_name: "Northbridge Education",
    subdomain: "northbridge",
    business_type: "agent",
    status: "pending",
    logo_url: null,
    verified_at: null,
    is_published: false,
    onboarding_completed: true,
  },
  member: { first_name: "Ada", last_name: "Lovelace", role: "owner", is_owner: true },
  credits: { balance: 14 },
  enquiries: { total: 2, locked: 1, recent: RECENT },
  services: { total: 6, published: 4 },
};

export const businessDashboardMockApi = {
  getDashboard: async (): Promise<BusinessDashboard> => {
    console.log("[mock] GET /businesses/dashboard");
    await delay(300);
    return DASHBOARD;
  },
};
