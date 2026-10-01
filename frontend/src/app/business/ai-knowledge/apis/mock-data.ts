import type {
  CreateMemoryInput, CreateMemoryOutcome, Memory, MemoryListParams, PatchMemoryInput,
  PatchRackProfileInput, RackProfile, ReviewInput, ReviewMessage, ReviewSession, StoredRackProfile,
} from "./types";

import { base, memories, sessions, setMemories, threads } from "./mock-fixtures";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const patch = (id: string, changes: Partial<Memory>): Memory => {
  setMemories(memories.map((m) => (m.id === id ? { ...m, ...changes, updated_at: new Date().toISOString() } : m)));
  return memories.find((m) => m.id === id)!;
};

/** Starts on the real defaults, so the mock shows what an institution actually sees on day one. */
let rackProfile: RackProfile = {
  voice: { tone: "warm", formality: 3, warmth: 3, response_length: "standard", language: "", use_cards: true },
  behaviour: {
    counselling_style: "consultative", ask_follow_ups: "when_unclear",
    explain_recommendations: "brief_reason", uncertainty: "say_unknown",
    lead_approach: "when_natural", initiative: "balanced",
  },
  collection: {
    allowed: ["nationality", "study_preference", "qualifications", "language_tests", "academic_tests", "work_experiences", "name", "email"],
    sensitive: [],
    may_ask_for: ["study_preference"],
    contact_ask: { enabled: true, first_at: [3, 5], gap: [5, 10] },
  },
  learning: { auto_learn: false, learn_general_knowledge: false },
};
let rackVersion = 0;

export const aiKnowledgeMockApi = {
  getProfile: async (): Promise<StoredRackProfile> => {
    console.log("[mock] getProfile");
    await delay(220);
    return { profile: rackProfile, version: rackVersion, updated_at: rackVersion ? new Date().toISOString() : null, configured: rackVersion > 0 };
  },

  updateProfile: async (patch: PatchRackProfileInput): Promise<StoredRackProfile> => {
    console.log("[mock] updateProfile", patch);
    await delay(320);
    // Mirrors the backend's optimistic check, so the conflict path is reachable in mock mode.
    if (patch.expected_version !== rackVersion) {
      throw new Error("Someone else changed these settings while you were editing. Reload to see their version.");
    }
    // Block-level merge, exactly as the service does it — a deep merge would make clearing a
    // list impossible to express.
    rackProfile = {
      voice: { ...rackProfile.voice, ...patch.voice },
      behaviour: { ...rackProfile.behaviour, ...patch.behaviour },
      collection: { ...rackProfile.collection, ...patch.collection },
      learning: { ...rackProfile.learning, ...patch.learning },
    };
    rackVersion += 1;
    return { profile: rackProfile, version: rackVersion, updated_at: new Date().toISOString(), configured: true };
  },

  listMemories: async (params: MemoryListParams = {}): Promise<Memory[]> => {
    console.log("[mock] listMemories", params);
    await delay(260);
    const q = params.q?.toLowerCase();
    return memories.filter((m) =>
      m.status !== "deleted"
      && (!params.status || m.status === params.status)
      && (!params.type || m.type === params.type)
      && (!params.source || m.source === params.source)
      && (params.flagged === undefined || (params.flagged ? !!m.flagged_at : !m.flagged_at))
      && (params.conflicting === undefined || (params.conflicting ? !!m.conflicts_with_id : !m.conflicts_with_id))
      && (!q || m.content.toLowerCase().includes(q)),
    );
  },

  getMemory: async (id: string): Promise<Memory> => {
    console.log("[mock] getMemory", id);
    await delay(150);
    return memories.find((m) => m.id === id)!;
  },

  createMemory: async (input: CreateMemoryInput): Promise<CreateMemoryOutcome> => {
    console.log("[mock] createMemory", input);
    await delay(320);
    const existing = memories.find((m) => m.content.trim().toLowerCase() === input.content.trim().toLowerCase());
    // The same statement twice is evidence, not a duplicate — the real endpoint says so too.
    if (existing) return { outcome: "reinforced", memory: patch(existing.id, { reinforce_count: existing.reinforce_count + 1 }), promoted: false };
    const memory: Memory = {
      ...base, id: `aaaaaaaa-0000-4000-8000-${String(memories.length).padStart(12, "0")}`,
      type: input.type, content: input.content, metadata: input.metadata ?? {},
      source: "admin", status: "active", confidence: 1, importance: input.importance ?? 3,
      source_reference: { actors: [], positive_voters: [], negative_voters: [] },
      reinforce_count: 0, use_count: 0,
      history: [{ at: new Date().toISOString(), event: "created", by: { kind: "admin" }, reason: "source=admin" }],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      expires_at: input.expires_at ?? null,
    };
    setMemories([memory, ...memories]);
    return { outcome: "created", memory };
  },

  updateMemory: async (id: string, input: PatchMemoryInput): Promise<Memory> => {
    console.log("[mock] updateMemory", id, input);
    await delay(240);
    return patch(id, input as Partial<Memory>);
  },

  approveMemory: async (id: string): Promise<Memory> => {
    console.log("[mock] approveMemory", id);
    await delay(240);
    // Approving clears the conflict link — the human has decided this one stands.
    return patch(id, { status: "active", confidence: 1, conflicts_with_id: null });
  },

  deprecateMemory: async (id: string, reason: string): Promise<Memory> => {
    console.log("[mock] deprecateMemory", id, reason);
    await delay(240);
    return patch(id, { status: "deprecated" });
  },

  reactivateMemory: async (id: string): Promise<Memory> => {
    console.log("[mock] reactivateMemory", id);
    await delay(240);
    return patch(id, { status: "active", flagged_at: null, expires_at: null });
  },

  unflagMemory: async (id: string): Promise<Memory> => {
    console.log("[mock] unflagMemory", id);
    await delay(200);
    return patch(id, { flagged_at: null });
  },

  deleteMemory: async (id: string): Promise<void> => {
    console.log("[mock] deleteMemory", id);
    await delay(200);
    setMemories(memories.filter((m) => m.id !== id));
  },

  listConversations: async (params: { unreviewed?: boolean; limit?: number } = {}): Promise<ReviewSession[]> => {
    console.log("[mock] listConversations", params);
    await delay(260);
    return params.unreviewed ? sessions.filter((s) => s.unreviewed > 0) : sessions;
  },

  listConversationMessages: async (sessionId: number): Promise<ReviewMessage[]> => {
    console.log("[mock] listConversationMessages", sessionId);
    await delay(220);
    return threads[sessionId] ?? [];
  },

  reviewMessage: async (messageId: number, review: ReviewInput): Promise<void> => {
    console.log("[mock] reviewMessage", messageId, review);
    await delay(320);
    for (const thread of Object.values(threads)) {
      const message = thread.find((m) => m.id === messageId);
      if (!message) continue;
      Object.assign(message, {
        review_status: review.status,
        correction: review.correction ?? null,
        review_note: review.note ?? null,
        reviewed_by: 12,
        reviewed_at: new Date().toISOString(),
      });
    }
    for (const s of sessions) {
      if (threads[s.id]?.some((m) => m.id === messageId)) s.unreviewed = Math.max(0, s.unreviewed - 1);
    }
  },
};
