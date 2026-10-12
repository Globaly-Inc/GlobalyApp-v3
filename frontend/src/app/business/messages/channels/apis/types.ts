/** WhatsApp, Instagram and Facebook — the channels connected through Zernio. */
export type ChannelKey = "whatsapp" | "instagram" | "facebook";

export type AiConfig = {
  capabilities: { answer: boolean; programs: boolean; collect: boolean; recommend: boolean; escalate: boolean };
  /** Team members may take over conversations on this channel. */
  takeover: boolean;
  escalation: { human: boolean; unsure: boolean; sensitive: boolean };
};

export type ChannelConnection = {
  id: number;
  channel: ChannelKey;
  /** The business account, Instagram account or Page name. */
  display_name: string;
  /** The number, @handle or Page username. */
  handle: string | null;
  /** "error" = Meta ended the connection; Reconnect fixes it. */
  status: "connected" | "error" | "disconnected";
  ai_mode: "auto" | "suggest";
  ai_config: AiConfig;
  /** WhatsApp only: Meta's quality rating — green, yellow, red. */
  quality: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ChannelsOverview = {
  /** False until the server has a Zernio API key: Connect can't work yet. */
  configured: boolean;
  connections: ChannelConnection[];
};

export type WhatsAppTemplate = { name: string; language: string; category: string | null; components: unknown[] };
