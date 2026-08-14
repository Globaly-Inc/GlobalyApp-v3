import type { MaraExtraction, MaraExtractionStatus } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockAgents: MaraExtraction[] = [
  {
    id: "m1",
    marn: "1234567",
    agent_name: "Jane Wilkins",
    business_name: "Wilkins Migration Services",
    registration_status: "Registered",
    registration_date: "2022-03-15",
    expiry_date: "2027-03-14",
    languages_spoken: ["English", "Mandarin"],
    practice_areas: ["Skilled Migration", "Student Visas"],
    office_country: "AU",
    office_state: "NSW",
    office_city: "Sydney",
    email: "jane@wilkinsmigration.com.au",
    phone: "+61 2 9000 1234",
    website: "https://wilkinsmigration.com.au",
    confidence_score: 0.92,
    status: "pending",
    source_url: "https://www.mara.gov.au/search-the-register",
    created_at: "2026-08-10T09:00:00Z",
  },
  {
    id: "m2",
    marn: "7654321",
    agent_name: "David Cho",
    business_name: "Pacific Visa Consultants",
    registration_status: "Registered",
    registration_date: "2020-06-01",
    expiry_date: "2025-05-31",
    languages_spoken: ["English", "Korean"],
    practice_areas: ["Family Migration", "Business Visas"],
    office_country: "AU",
    office_state: "VIC",
    office_city: "Melbourne",
    email: "david@pacificvisa.com.au",
    phone: "+61 3 8000 5678",
    website: "https://pacificvisa.com.au",
    confidence_score: 0.85,
    status: "pending",
    source_url: "https://www.mara.gov.au/search-the-register",
    created_at: "2026-08-09T08:00:00Z",
  },
  {
    id: "m3",
    marn: "1112233",
    agent_name: "Priya Sharma",
    business_name: "Sharma Immigration",
    registration_status: "Cancelled",
    registration_date: "2019-01-10",
    expiry_date: "2024-01-09",
    languages_spoken: ["English", "Hindi", "Punjabi"],
    practice_areas: ["Student Visas"],
    office_country: "AU",
    office_state: "QLD",
    office_city: "Brisbane",
    email: null,
    phone: null,
    website: null,
    confidence_score: 0.6,
    status: "discarded",
    source_url: null,
    created_at: "2026-08-08T07:00:00Z",
  },
  {
    id: "m4",
    marn: "9988776",
    agent_name: "Maria Santos",
    business_name: "Santos & Associates",
    registration_status: "Registered",
    registration_date: "2023-09-01",
    expiry_date: "2028-08-31",
    languages_spoken: ["English", "Portuguese", "Spanish"],
    practice_areas: ["Skilled Migration", "Employer Sponsored"],
    office_country: "AU",
    office_state: "WA",
    office_city: "Perth",
    email: "maria@santosassoc.com.au",
    phone: "+61 8 6000 9012",
    website: "https://santosassoc.com.au",
    confidence_score: 0.94,
    status: "promoted",
    source_url: "https://www.mara.gov.au/search-the-register",
    created_at: "2026-08-07T06:00:00Z",
  },
];

export const maraAgentsMockApi = {
  listMaraAgents: async (status?: MaraExtractionStatus): Promise<MaraExtraction[]> => {
    console.log("[mock] GET /admin/data-extraction/mara-agents?status=" + (status ?? "all"));
    await delay(300);
    if (!status || (status as string) === "all") return mockAgents;
    return mockAgents.filter((a) => a.status === status);
  },

  discardMaraAgent: async (id: string): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/mara-agents/" + id + "/discard");
    await delay(200);
    mockAgents = mockAgents.map((a) => (a.id === id ? { ...a, status: "discarded" as const } : a));
  },

  promoteMaraAgent: async (id: string): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/mara-agents/" + id + "/promote");
    await delay(200);
    mockAgents = mockAgents.map((a) => (a.id === id ? { ...a, status: "promoted" as const } : a));
  },

  launchExtraction: async (urls: string[]): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/mara-agents/extract", urls);
    await delay(200);
    throw new Error("Extraction service unavailable (503 stub)");
  },
};
