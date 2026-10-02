import { uuid } from "@/lib/utils";
import { aiWidgetInboxMock } from "./mock-inbox";
import { mockVisitors } from "./mock-visitors";
import type {
  CreateEmbedConfigInput, DeveloperContact, EmbedConfig, EnsureEmbedResult,
  SendSnippetInput, SendSnippetResult, UpdateEmbedConfigInput,
  VisitorCounts, VisitorListParams, VisitorListResult, VisitorPatch, WidgetVisitor,
} from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Starts empty so the card's "no developer yet" path — the one with real consequences — is the
 *  default thing you see against mocks. `sendSnippet` fills it, as a real invite would. */
let mockDeveloper: DeveloperContact | null = null;

let seq = 3;

const seedConfig: EmbedConfig = {
  id: 1,
  business_id: 1,
  institution_id: null,
  embed_key: "a3b8f2c1-4d5e-6f70-8192-a3b4c5d6e7f8",
  display_name: "Acme University Counsellor",
  logo_url: null,
  brand_color: "#4f46e5",
  position: "right",
  custom_instructions: "Always mention our February and July intakes.",
  greeting: "Hi! Ask me anything about studying at Acme.",
  subtitle: "Usually replies in seconds",
  monthly_credit_limit: 1000,
  credits_used_this_month: 214,
  month_reset_at: "2026-09-01T00:00:00Z",
  is_active: true,
  created_at: "2026-08-01T10:00:00Z",
  updated_at: "2026-08-01T10:00:00Z",
};

const configs: EmbedConfig[] = [seedConfig];

const visitors = mockVisitors;

export const aiWidgetVisitorsMock = {
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
      ? visitors.filter((v) => `${v.name ?? ""} ${v.email ?? ""} ${v.study_preference ?? ""}`.toLowerCase().includes(term))
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
    // Copies: Redux freezes what it stores, and the takeover mock mutates these rows later.
    return { data: filtered.slice((page - 1) * limit, page * limit).map((v) => ({ ...v })), total: filtered.length, counts };
  },
};

export const aiWidgetMockApi = {
  listConfigs: async (): Promise<EmbedConfig[]> => {
    console.log("[mock] GET /ai-chat/embed/configs");
    await delay(300);
    return [...configs];
  },

  ensureConfig: async (): Promise<EnsureEmbedResult> => {
    console.log("[mock] ensureConfig");
    await delay(300);
    // Mirrors ensureForOwner, which resolves the OLDEST active widget — against mocks that is
    // always the seeded one, because createConfig unshifts newer widgets in front of it. NOT
    // `configs[0]`: that is the newest, and the card would then follow a key nobody installed.
    // updateConfig mutates this same object, so edits show up here without a lookup.
    return {
      config: seedConfig,
      snippet: `<script src="https://app.globalyapp.com/embed.js" data-key="${seedConfig.embed_key}" async></script>`,
      developer: mockDeveloper,
    };
  },

  sendSnippet: async (input: SendSnippetInput): Promise<SendSnippetResult> => {
    console.log("[mock] sendSnippet", input);
    await delay(500);
    if (mockDeveloper) return { sent_to: mockDeveloper.email, invited: false };
    if (!input.invitee) throw new Error("Nobody on your team has the Developer role yet — send a name and email to invite one.");
    // Mirrors the real thing: the invite lands first, so a second send goes to them, not a new person.
    mockDeveloper = { email: input.invitee.email, name: input.invitee.name, pending: true };
    return { sent_to: input.invitee.email, invited: true };
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
      position: input.position ?? "right",
      custom_instructions: input.custom_instructions ?? null,
      greeting: input.greeting ?? null,
      subtitle: input.subtitle ?? null,
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

  updateConfig: async (id: number, input: UpdateEmbedConfigInput): Promise<EmbedConfig> => {
    console.log("[mock] PATCH /ai-chat/embed/configs/" + id, input);
    await delay(300);
    const config = configs.find((c) => c.id === id);
    if (!config) throw new Error("Embed config not found");
    Object.assign(config, input, { updated_at: new Date().toISOString() });
    return { ...config };
  },

  rotateKey: async (id: number): Promise<EmbedConfig> => {
    console.log("[mock] POST /ai-chat/embed/configs/" + id + "/rotate-key");
    await delay(300);
    const config = configs.find((c) => c.id === id);
    if (!config) throw new Error("Embed config not found");
    config.embed_key = uuid();
    return { ...config };
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
  ...aiWidgetInboxMock,
};
