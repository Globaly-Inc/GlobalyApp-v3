import type { Representation, RepresentationInviteInput, RepresentationTarget } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MOCK_TARGETS: RepresentationTarget[] = [
  { id: 201, business_name: "Sunita Education Hub", logo_url: null, city: "Kawasoti" },
  { id: 202, business_name: "Global Study Institute", logo_url: null, city: "Sydney" },
  { id: 203, business_name: "Kathmandu School of Management", logo_url: null, city: "Kathmandu" },
];

let representations: Representation[] = [
  {
    id: "r1", status: "active", regions: ["Kathmandu"], notes: null,
    created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(), responded_at: new Date().toISOString(),
    my_role: "agent", can_respond: false,
    partner: { id: 202, business_name: "Global Study Institute", logo_url: null, city: "Sydney" },
  },
  {
    id: "r2", status: "pending", regions: [], notes: "Would like to represent your institution in Nepal.",
    created_at: new Date().toISOString(), responded_at: null,
    my_role: "institution", can_respond: true,
    partner: { id: 201, business_name: "Sunita Education Hub", logo_url: null, city: "Kawasoti" },
  },
];

export const representationsMockApi = {
  list: async (): Promise<Representation[]> => {
    console.log("[mock] representations.list");
    await delay(300);
    return representations;
  },
  search: async (search?: string): Promise<RepresentationTarget[]> => {
    console.log("[mock] representations.search", search);
    await delay(300);
    if (!search) return MOCK_TARGETS;
    const q = search.toLowerCase();
    return MOCK_TARGETS.filter((t) => t.business_name.toLowerCase().includes(q));
  },
  invite: async (input: RepresentationInviteInput): Promise<Representation> => {
    console.log("[mock] representations.invite", input);
    await delay(300);
    const target = MOCK_TARGETS.find((t) => t.id === input.target_business_id);
    const created: Representation = {
      id: `r${representations.length + 1}`, status: "pending", regions: input.regions ?? [], notes: input.notes ?? null,
      created_at: new Date().toISOString(), responded_at: null,
      my_role: "agent", can_respond: false,
      partner: target ?? { id: input.target_business_id, business_name: "Unknown business", logo_url: null, city: null },
    };
    representations = [created, ...representations];
    return created;
  },
  respond: async (id: string, status: "active" | "rejected"): Promise<Representation> => {
    console.log("[mock] representations.respond", id, status);
    await delay(300);
    const rep = representations.find((r) => r.id === id);
    if (!rep) throw new Error("Representation not found");
    rep.status = status;
    rep.responded_at = new Date().toISOString();
    rep.can_respond = false;
    return rep;
  },
};
