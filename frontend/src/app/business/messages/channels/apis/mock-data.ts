import type { AiConfig, ChannelConnection, ChannelKey, ChannelsOverview, WhatsAppTemplate } from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

const DEFAULT_AI: AiConfig = {
  capabilities: { answer: true, programs: true, collect: true, recommend: true, escalate: true },
  takeover: true,
  escalation: { human: true, unsure: true, sensitive: true },
};

const MOCK_ACCOUNTS: Record<ChannelKey, { display_name: string; handle: string }> = {
  whatsapp: { display_name: "Globaly Education", handle: "+977 980-111 2244" },
  instagram: { display_name: "Globaly Education", handle: "globalyeducation" },
  facebook: { display_name: "Globaly Education", handle: "globalyeducation" },
};

let nextId = 3;
const connections: ChannelConnection[] = [
  { id: 1, channel: "whatsapp", ...MOCK_ACCOUNTS.whatsapp, status: "connected", ai_mode: "auto", ai_config: DEFAULT_AI, quality: "green", error_message: null, created_at: now(), updated_at: now() },
  { id: 2, channel: "instagram", ...MOCK_ACCOUNTS.instagram, status: "connected", ai_mode: "auto", ai_config: DEFAULT_AI, quality: null, error_message: null, created_at: now(), updated_at: now() },
];

const TEMPLATES: WhatsAppTemplate[] = [
  { name: "intake_follow_up", language: "en_US", category: "MARKETING", components: [{ type: "BODY", text: "Hi {{1}}, thanks for your interest in studying with us. Would you like an update on the next intake for your program?" }] },
  { name: "counselling_call", language: "en_US", category: "UTILITY", components: [{ type: "BODY", text: "Hi {{1}}, our admissions team can call you to talk through your study plans. Reply YES and we'll book a time." }] },
  { name: "documents_reminder", language: "en_US", category: "UTILITY", components: [{ type: "BODY", text: "Hi {{1}}, a quick reminder that we're still waiting on a few documents for your application. Reply here if you need help." }] },
];

/**
 * Mock of the Channels endpoints. "Connect" skips Zernio and Meta: it hands back a URL to our own
 * return path with the params Zernio's success redirect carries, so the page's return handling
 * runs exactly as it will for real.
 */
export const channelsMockApi = {
  listChannels: async (): Promise<ChannelsOverview> => {
    console.log("[mock] GET /channels");
    await delay(250);
    return { configured: true, connections: connections.filter((c) => c.status !== "disconnected").map((c) => ({ ...c })) };
  },

  connectChannel: async (channel: ChannelKey, body: { return_path: string; reconnect_id?: number }): Promise<string> => {
    console.log("[mock] POST /channels/" + channel + "/connect", body);
    await delay(400);
    const q = new URLSearchParams({ zernio_channel: channel, connected: channel, accountId: `mock-${channel}` });
    return `${body.return_path}?${q}`;
  },

  confirmChannel: async (channel: ChannelKey, accountId?: string): Promise<ChannelConnection[]> => {
    console.log("[mock] POST /channels/" + channel + "/confirm", { accountId });
    await delay(500);
    let conn = connections.find((c) => c.channel === channel);
    if (conn) Object.assign(conn, { status: "connected", error_message: null, updated_at: now() });
    else {
      conn = { id: nextId++, channel, ...MOCK_ACCOUNTS[channel], status: "connected", ai_mode: "auto", ai_config: DEFAULT_AI, quality: channel === "whatsapp" ? "green" : null, error_message: null, created_at: now(), updated_at: now() };
      connections.push(conn);
    }
    return [{ ...conn }];
  },

  updateChannelAi: async (id: number, body: { ai_mode: "auto" | "suggest"; ai_config: AiConfig }): Promise<ChannelConnection> => {
    console.log("[mock] PATCH /channels/" + id + "/ai", body);
    await delay(300);
    const conn = connections.find((c) => c.id === id);
    if (!conn) throw new Error("Connection not found");
    Object.assign(conn, body, { updated_at: now() });
    return { ...conn };
  },

  disconnectChannel: async (id: number): Promise<void> => {
    console.log("[mock] DELETE /channels/" + id);
    await delay(300);
    const conn = connections.find((c) => c.id === id);
    if (conn) conn.status = "disconnected";
  },

  listTemplates: async (id: number): Promise<WhatsAppTemplate[]> => {
    console.log("[mock] GET /channels/" + id + "/templates");
    await delay(300);
    return TEMPLATES.map((t) => ({ ...t }));
  },
};
