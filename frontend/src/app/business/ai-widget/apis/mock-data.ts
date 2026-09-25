import { uuid } from "@/lib/utils";
import type {
  CreateEmbedConfigInput, EmbedConfig,
  VisitorCounts, VisitorListParams, VisitorListResult, VisitorMessage, VisitorPatch, WidgetVisitor,
} from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

let seq = 3;
const configs: EmbedConfig[] = [
  {
    id: 1,
    business_id: 1,
    institution_id: null,
    embed_key: "a3b8f2c1-4d5e-6f70-8192-a3b4c5d6e7f8",
    display_name: "Acme University Counsellor",
    logo_url: null,
    brand_color: "#4f46e5",
    custom_instructions: "Always mention our February and July intakes.",
    monthly_credit_limit: 1000,
    credits_used_this_month: 214,
    month_reset_at: "2026-09-01T00:00:00Z",
    is_active: true,
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-01T10:00:00Z",
  },
];

// ── Visitors ─────────────────────────────────────────────────────────────────
// Deliberately mixed: two anonymous rows, two who handed over their details, one who was
// shown the contact card and skipped it. That last one is the case the UI gets wrong most
// easily — asked, declined, still a Visitor.
const visitors: WidgetVisitor[] = [
  {
    id: 4, embed_config_id: 1, session_id: 812, name: null, email: null, status: "visitor",
    contact_status: "not_shown", contact_submitted_at: null, conversation_state: "active",
    message_count: 2,
    first_seen_at: new Date(Date.now() - 4 * 60_000).toISOString(),
    last_activity_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    qualifications: null, language_tests: null, academic_tests: null, work_experiences: null,
    age: null, gender: null, nationality: null, nationality_raw: null, study_preference: null,
    summary_status: null, summary_sent_at: null,
  },
  {
    id: 3, embed_config_id: 1, session_id: 809, name: "John Doe", email: "john@example.com", status: "lead",
    contact_status: "submitted",
    contact_submitted_at: new Date(Date.now() - 6 * 60_000).toISOString(),
    conversation_state: "end_confirmed", message_count: 11,
    first_seen_at: new Date(Date.now() - 22 * 60_000).toISOString(),
    last_activity_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    qualifications: [{ degree_title: "BSc Computer Science", institution_name: "Tribhuvan University", grade_value: "3.4", grading_system: "GPA" }],
    language_tests: [{ test_type: "IELTS", overall_score: "7.0", test_date: "2026-06-12", sub_scores: { listening: "7.5", reading: "7.0" } }],
    academic_tests: null,
    work_experiences: [{ job_title: "Junior Developer", organization_name: "Leapfrog", is_current: true, start_date: "2025-02-01" }],
    // "I'm Nepali" — resolved to the country, with their own wording kept beside it.
    age: "24", gender: "male", nationality: "Nepal", nationality_raw: "Nepali",
    study_preference: "MSc Data Science",
    summary_status: "sent", summary_sent_at: new Date(Date.now() - 4 * 60_000).toISOString(),
  },
  {
    id: 2, embed_config_id: 1, session_id: 804, name: null, email: null, status: "visitor",
    contact_status: "skipped", contact_submitted_at: null, conversation_state: "continue",
    message_count: 7,
    first_seen_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    last_activity_at: new Date(Date.now() - 95 * 60_000).toISOString(),
    qualifications: [{ degree_title: "High School", institution_name: "St. Xavier's" }],
    language_tests: null, academic_tests: null, work_experiences: null,
    age: null, gender: null, nationality: null, nationality_raw: null,
    study_preference: "Bachelor of Business Administration",
    summary_status: null, summary_sent_at: null,
  },
  {
    id: 1, embed_config_id: 1, session_id: 791, name: "Priya Sharma", email: "priya.sharma@example.com", status: "lead",
    contact_status: "submitted",
    contact_submitted_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    conversation_state: "active", message_count: 19,
    first_seen_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    last_activity_at: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    qualifications: null,
    language_tests: [{ test_status: "booked", test_type: "PTE", test_date: "2026-11-02" }],
    academic_tests: [{ test_type: "GRE", overall_score: "318" }],
    work_experiences: null,
    // "early 30s" is why age is verbatim text, and "Kashmiri" is why an unmatched nationality
    // keeps the raw wording rather than being filed under a country they did not name.
    age: "early 30s", gender: "female", nationality: null, nationality_raw: "Kashmiri",
    study_preference: "MBA",
    summary_status: "pending", summary_sent_at: null,
  },
];

export const aiWidgetVisitorsMock = {
  listVisitorMessages: async (id: number): Promise<VisitorMessage[]> => {
    console.log("[mock] GET /ai-chat/embed/visitors/" + id + "/messages");
    await delay(250);
    const at = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    return [
      { id: id * 10 + 1, role: "user", content: "Hi, do you offer a Masters in Data Science?", created_at: at(30) },
      { id: id * 10 + 2, role: "assistant", content: "Yes! Our **MSc Data Science** runs for 18 months with February and July intakes.", created_at: at(29) },
      { id: id * 10 + 3, role: "user", content: "What IELTS score do I need?", created_at: at(27) },
      { id: id * 10 + 4, role: "assistant", content: "An overall **6.5** with no band below 6.0.", created_at: at(26) },
    ];
  },

  getVisitor: async (id: number): Promise<WidgetVisitor> => {
    console.log("[mock] GET /ai-chat/embed/visitors/" + id);
    await delay(250);
    const found = visitors.find((v) => v.id === id);
    if (!found) throw new Error("Visitor not found");
    return { ...found };
  },

  updateVisitor: async (id: number, patch: VisitorPatch): Promise<WidgetVisitor> => {
    console.log("[mock] PATCH /ai-chat/embed/visitors/" + id, patch);
    await delay(300);
    const found = visitors.find((v) => v.id === id);
    if (!found) throw new Error("Visitor not found");
    Object.assign(found, patch);
    // Mirrors the generated column: the row IS a lead the moment it has an email, so editing
    // one in must move the badge here too, or the mock lies about the thing being demonstrated.
    found.status = found.email ? "lead" : "visitor";
    return { ...found };
  },

  listVisitors: async (params: VisitorListParams = {}): Promise<VisitorListResult> => {
    console.log("[mock] GET /ai-chat/embed/visitors", params);
    await delay(300);
    const term = params.search?.trim().toLowerCase();
    const searched = term
      ? visitors.filter((v) => `${v.name ?? ""} ${v.email ?? ""}`.toLowerCase().includes(term))
      : visitors;
    // Counts are taken BEFORE the status filter and after the search — same as the backend,
    // so the tab tallies don't collapse to the active tab's own size.
    const counts: VisitorCounts = {
      all: searched.length,
      lead: searched.filter((v) => v.status === "lead").length,
      visitor: searched.filter((v) => v.status === "visitor").length,
    };
    const status = params.status ?? "all";
    const filtered = status === "all" ? searched : searched.filter((v) => v.status === status);
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    return { data: filtered.slice((page - 1) * limit, page * limit), total: filtered.length, counts };
  },
};

export const aiWidgetMockApi = {
  listConfigs: async (): Promise<EmbedConfig[]> => {
    console.log("[mock] GET /ai-chat/embed/configs");
    await delay(300);
    return [...configs];
  },

  createConfig: async (input: CreateEmbedConfigInput): Promise<EmbedConfig> => {
    console.log("[mock] POST /ai-chat/embed/configs", input);
    await delay(300);
    const config: EmbedConfig = {
      id: seq++,
      business_id: 1,
    institution_id: null,
      embed_key: uuid(),
      display_name: input.display_name ?? null,
      logo_url: input.logo_url ?? null,
      brand_color: input.brand_color ?? null,
      custom_instructions: input.custom_instructions ?? null,
      monthly_credit_limit: input.monthly_credit_limit ?? 1000,
      credits_used_this_month: 0,
      month_reset_at: "2026-09-01T00:00:00Z",
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    configs.unshift(config);
    return config;
  },

  deactivateConfig: async (id: number): Promise<void> => {
    console.log("[mock] DELETE /ai-chat/embed/configs/" + id);
    await delay(300);
    const config = configs.find((c) => c.id === id);
    if (config) config.is_active = false;
  },

  reactivateConfig: async (id: number): Promise<void> => {
    console.log("[mock] PATCH /ai-chat/embed/configs/" + id + "/activate");
    await delay(300);
    const config = configs.find((c) => c.id === id);
    if (config) config.is_active = true;
  },

  ...aiWidgetVisitorsMock,
};
