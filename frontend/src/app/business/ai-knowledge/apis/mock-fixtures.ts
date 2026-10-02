// Fixtures for the mock API. Split out of mock-data.ts to keep that file under the 300-line
// limit; the api object stays there, the canned rows live here.
//
// Deliberately one row per state the list has to render differently, because each is a
// different set of available actions — see the comment on `memories` below.

import type { Memory, ReviewMessage, ReviewSession } from "./types";

const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

export const base = {
  institution_id: 49,
  content_hash: "",
  metadata: {},
  version: 1,
  has_embedding: true,
  flagged_at: null,
  conflicts_with_id: null,
  created_by: null,
  created_by_name: null,
  last_used_at: null,
  expires_at: null,
} as const;

/**
 * Deliberately one row per state the list has to render differently, because each is a different
 * set of available actions:
 *   active + admin        nothing to approve, can be deprecated
 *   active + flagged      votes raised a hand; unflag or deprecate
 *   candidate + extracted the ordinary review case — approve or delete
 *   candidate + conflict  CANNOT be approved into coexistence; approving retires the other
 *   deprecated            reactivate only
 *   no embedding          listed and pinned, but similarity retrieval misses it
 */
export let memories: Memory[] = [
  {
    ...base, id: "11111111-1111-4111-8111-111111111111",
    type: "COUNSELLING_GUIDELINE",
    content: "Always confirm the applicant's highest completed qualification before suggesting a postgraduate course.",
    source: "admin", status: "active", confidence: 1, importance: 5,
    source_reference: { actors: [], positive_voters: [], negative_voters: [] },
    reinforce_count: 0, use_count: 143, last_used_at: ago(12),
    history: [{ at: ago(14 * 24 * 60), event: "created", by: { kind: "admin" }, reason: "source=admin" }],
    created_at: ago(14 * 24 * 60), updated_at: ago(14 * 24 * 60),
  },
  {
    ...base, id: "22222222-2222-4222-8222-222222222222",
    type: "AVOIDANCE_RULE",
    content: "Never tell a visitor their visa will be approved, or estimate their chance of approval.",
    metadata: { severity: "hard" },
    source: "admin", status: "active", confidence: 1, importance: 5,
    source_reference: { actors: [], positive_voters: [], negative_voters: [] },
    reinforce_count: 0, use_count: 143, last_used_at: ago(12),
    history: [{ at: ago(14 * 24 * 60), event: "created", by: { kind: "admin" }, reason: "source=admin" }],
    created_at: ago(14 * 24 * 60), updated_at: ago(14 * 24 * 60),
  },
  {
    ...base, id: "33333333-3333-4333-8333-333333333333",
    type: "RESPONSE_PREFERENCE",
    content: "Keep replies to three short paragraphs and lead with the direct answer.",
    metadata: { tone: "warm_formal", detail_level: "brief", use_cards: true },
    source: "admin", status: "active", confidence: 1, importance: 4,
    source_reference: { actors: [], positive_voters: [], negative_voters: [] },
    reinforce_count: 0, use_count: 143, last_used_at: ago(12),
    history: [{ at: ago(9 * 24 * 60), event: "created", by: { kind: "admin" }, reason: "source=admin" }],
    created_at: ago(9 * 24 * 60), updated_at: ago(9 * 24 * 60),
  },
  {
    ...base, id: "44444444-4444-4444-8444-444444444444",
    type: "STUDENT_CONCERN_PATTERN",
    content: "Visitors asking about part-time study usually want to know whether it affects their visa eligibility.",
    metadata: { concern: "part-time study and visa status", approach: "raise the visa implication before they ask" },
    source: "extracted", status: "candidate", confidence: 0.74, importance: 3,
    source_reference: { session_id: 812, actors: ["a1b2c3d4e5f60718", "b2c3d4e5f6071829"], positive_voters: [], negative_voters: [] },
    reinforce_count: 1, use_count: 0,
    history: [
      { at: ago(3 * 24 * 60), event: "created", by: { kind: "system" }, reason: "source=extracted" },
      { at: ago(26 * 60), event: "reinforced", by: { kind: "system" } },
    ],
    created_at: ago(3 * 24 * 60), updated_at: ago(26 * 60),
  },
  {
    ...base, id: "55555555-5555-4555-8555-555555555555",
    type: "RESPONSE_PATTERN",
    content: "Recommend a course before asking what the visitor wants to study, to keep the conversation moving.",
    metadata: { technique: "structure_recommendation", trigger: "the visitor opens with a broad question" },
    source: "extracted", status: "candidate", confidence: 0.63, importance: 3,
    conflicts_with_id: "11111111-1111-4111-8111-111111111111",
    source_reference: { session_id: 907, actors: ["c3d4e5f607182930"], positive_voters: [], negative_voters: [] },
    reinforce_count: 0, use_count: 0,
    history: [
      { at: ago(2 * 24 * 60), event: "created", by: { kind: "system" }, reason: "source=extracted" },
      { at: ago(2 * 24 * 60), event: "conflict_flagged", by: { kind: "system" }, reason: "contradicts 11111111-1111-4111-8111-111111111111 (admin)" },
    ],
    created_at: ago(2 * 24 * 60), updated_at: ago(2 * 24 * 60),
  },
  {
    ...base, id: "66666666-6666-4666-8666-666666666666",
    type: "COUNSELLOR_CORRECTION",
    content: "Our January intake closes for international applicants in early October, not in December.",
    metadata: { message_id: 4471 },
    source: "correction", status: "active", confidence: 1, importance: 3,
    flagged_at: ago(80),
    source_reference: { message_id: 4471, session_id: 844, actors: [], positive_voters: [], negative_voters: ["d4e5f60718293041"] },
    reinforce_count: 0, use_count: 31, last_used_at: ago(95),
    history: [
      { at: ago(6 * 24 * 60), event: "created", by: { kind: "counsellor" }, reason: "source=correction" },
      { at: ago(80), event: "flagged", by: { kind: "student" }, reason: "5 negative votes" },
    ],
    created_at: ago(6 * 24 * 60), updated_at: ago(80),
  },
  {
    ...base, id: "77777777-7777-4777-8777-777777777777",
    type: "TERMINOLOGY",
    content: 'Say "study options" rather than "pathways" — visitors read pathway as a foundation year.',
    metadata: { term: "study options", meaning: "the ways a course can be taken", use_instead_of: ["pathways"] },
    source: "admin", status: "deprecated", confidence: 1, importance: 2,
    source_reference: { actors: [], positive_voters: [], negative_voters: [] },
    reinforce_count: 0, use_count: 8,
    history: [
      { at: ago(30 * 24 * 60), event: "created", by: { kind: "admin" }, reason: "source=admin" },
      { at: ago(5 * 24 * 60), event: "deprecated", by: { kind: "admin" }, reason: "we use pathway in the prospectus now" },
    ],
    created_at: ago(30 * 24 * 60), updated_at: ago(5 * 24 * 60),
  },
  {
    ...base, id: "88888888-8888-4888-8888-888888888888",
    type: "INSTITUTION_POLICY",
    content: "Application fees are waived for applicants who apply through one of our partner agents.",
    metadata: { url: "https://example.edu/apply/fees" },
    source: "admin", status: "active", confidence: 1, importance: 3,
    has_embedding: false,
    source_reference: { actors: [], positive_voters: [], negative_voters: [] },
    reinforce_count: 0, use_count: 0,
    history: [{ at: ago(40), event: "created", by: { kind: "admin" }, reason: "source=admin" }],
    created_at: ago(40), updated_at: ago(40),
  },
];

export const sessions: ReviewSession[] = [
  { id: 907, embed_config_id: 3, title: "MBA entry requirements", message_count: 12, is_archived: false, created_at: ago(190), updated_at: ago(140), unreviewed: 3, flagged: 1 },
  { id: 844, embed_config_id: 3, title: "January intake deadline", message_count: 8, is_archived: false, created_at: ago(6 * 24 * 60), updated_at: ago(6 * 24 * 60 - 40), unreviewed: 0, flagged: 1 },
  { id: 812, embed_config_id: 3, title: "Part-time study and visas", message_count: 6, is_archived: false, created_at: ago(3 * 24 * 60), updated_at: ago(3 * 24 * 60 - 25), unreviewed: 2, flagged: 0 },
];

export const threads: Record<number, ReviewMessage[]> = {
  907: [
    { id: 5001, role: "user", content: "What do I need to get into your MBA?", cards: [], feedback: null, review_status: null, correction: null, review_note: null, reviewed_by: null, reviewed_at: null, memory_ids: [], created_at: ago(190) },
    { id: 5002, role: "assistant", content: "Our MBA asks for a recognised bachelor's degree and two years of work experience. Most applicants also submit an English test — IELTS 6.5 overall with no band below 6.0.", cards: [], feedback: null, review_status: null, correction: null, review_note: null, reviewed_by: null, reviewed_at: null, memory_ids: ["11111111-1111-4111-8111-111111111111"], created_at: ago(188) },
    { id: 5003, role: "user", content: "I did my bachelor's in 2019, is that too old?", cards: [], feedback: null, review_status: null, correction: null, review_note: null, reviewed_by: null, reviewed_at: null, memory_ids: [], created_at: ago(170) },
    { id: 5004, role: "assistant", content: "Not at all — there's no expiry on the degree itself. What matters is the work experience since.", cards: [], feedback: "negative", review_status: null, correction: null, review_note: null, reviewed_by: null, reviewed_at: null, memory_ids: ["11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333"], created_at: ago(168) },
    { id: 5005, role: "user", content: "And can I start in January?", cards: [], feedback: null, review_status: null, correction: null, review_note: null, reviewed_by: null, reviewed_at: null, memory_ids: [], created_at: ago(142) },
    { id: 5006, role: "assistant", content: "Yes — the January intake is open and applications usually close in December.", cards: [], feedback: null, review_status: null, correction: null, review_note: null, reviewed_by: null, reviewed_at: null, memory_ids: [], created_at: ago(140) },
  ],
  844: [
    { id: 4470, role: "user", content: "When do January applications close?", cards: [], feedback: null, review_status: null, correction: null, review_note: null, reviewed_by: null, reviewed_at: null, memory_ids: [], created_at: ago(6 * 24 * 60) },
    { id: 4471, role: "assistant", content: "January applications usually close in December.", cards: [], feedback: "negative", review_status: "corrected", correction: "Our January intake closes for international applicants in early October, not in December.", review_note: "International deadline is earlier — this has come up twice.", reviewed_by: 12, reviewed_at: ago(6 * 24 * 60 - 30), memory_ids: [], created_at: ago(6 * 24 * 60 - 2) },
  ],
  812: [
    { id: 3300, role: "user", content: "Can I study part time?", cards: [], feedback: null, review_status: null, correction: null, review_note: null, reviewed_by: null, reviewed_at: null, memory_ids: [], created_at: ago(3 * 24 * 60) },
    { id: 3301, role: "assistant", content: "Several of our programs can be taken part time. If you're applying on a student visa, part-time study usually isn't permitted — worth checking before you choose.", cards: [], feedback: "positive", review_status: "approved", correction: null, review_note: null, reviewed_by: 12, reviewed_at: ago(3 * 24 * 60 - 20), memory_ids: ["44444444-4444-4444-8444-444444444444"], created_at: ago(3 * 24 * 60 - 1) },
    { id: 3302, role: "user", content: "Ok thanks", cards: [], feedback: null, review_status: null, correction: null, review_note: null, reviewed_by: null, reviewed_at: null, memory_ids: [], created_at: ago(3 * 24 * 60 - 26) },
    { id: 3303, role: "assistant", content: "Happy to help. Anything else about the application?", cards: [], feedback: null, review_status: null, correction: null, review_note: null, reviewed_by: null, reviewed_at: null, memory_ids: [], created_at: ago(3 * 24 * 60 - 25) },
  ],
};

export const setMemories = (next: Memory[]) => { memories = next; };
