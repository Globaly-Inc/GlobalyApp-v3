import type {
  CreateMemoryInput, CreateMemoryOutcome, Memory, MemoryCounts, MemoryListParams, PatchMemoryInput,
  ConversionInsights, PatchRackProfileInput, RackProfile, ReviewInput, ReviewMessage, ReviewSession,
  StoredRackProfile,
} from "./types";

import { base, memories, sessions, setMemories, threads } from "./mock-fixtures";
import { isAlwaysOn, needsDecision } from "../utils";

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

/**
 * A plausible funnel rather than round numbers: most conversations never convert, most that do
 * were asked, and a minority volunteer — which is the asymmetry the panel exists to show.
 */
const insights: ConversionInsights = {
  conversations: 214,
  converted: 38,
  // volunteered + prompted === converted: one axis (was the counsellor ever asked), so the two
  // partition the leads rather than overlapping.
  volunteered: 11,
  prompted: 27,
  median_messages_to_conversion: 7,
  median_seconds_to_conversion: 412,
  top_paths: [
    { path: ["course", "eligibility", "fees", "application"], count: 9 },
    { path: ["course", "fees", "contact"], count: 6 },
    { path: ["eligibility", "course", "application"], count: 5 },
    { path: ["fees", "scholarship", "application"], count: 4 },
    { path: ["course", "visa", "eligibility", "contact"], count: 3 },
  ],
  topic_before_conversion: [
    { value: "application", count: 14 }, { value: "fees", count: 9 },
    { value: "contact", count: 7 }, { value: "eligibility", count: 5 }, { value: "visa", count: 3 },
  ],
  first_topic: [
    { value: "course", count: 96 }, { value: "fees", count: 48 }, { value: "eligibility", count: 31 },
    { value: "visa", count: 19 }, { value: "scholarship", count: 12 }, { value: "other", count: 8 },
  ],
};

export const aiKnowledgeMockApi = {
  getConversionInsights: async (): Promise<ConversionInsights> => {
    console.log("[mock] getConversionInsights");
    await delay(240);
    return insights;
  },

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

  // Counted over every fixture row, the way the endpoint counts over every stored row — a mock
  // that reduced a truncated list would hide the very bug this endpoint exists to fix.
  getMemorySummary: async (): Promise<MemoryCounts> => {
    console.log("[mock] getMemorySummary");
    await delay(200);
    const live = memories.filter((m) => m.status !== "deleted");
    return {
      active: live.filter((m) => m.status === "active").length,
      candidate: live.filter((m) => m.status === "candidate").length,
      conflicting: live.filter((m) => !!m.conflicts_with_id).length,
      flagged: live.filter((m) => !!m.flagged_at).length,
      alwaysOn: live.filter(isAlwaysOn).length,
      needsYou: live.filter(needsDecision).length,
      unreviewedReplies: sessions.reduce((n, x) => n + x.unreviewed, 0),
    };
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
