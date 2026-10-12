// WhatsApp, Instagram and Facebook Messenger through Zernio. AI Embed (the website widget) is
// the fourth Inbox channel but never goes through Zernio, so it isn't listed here.

export const CHANNELS = ["whatsapp", "instagram", "facebook"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
};

export const isChannel = (v: unknown): v is Channel => typeof v === "string" && (CHANNELS as readonly string[]).includes(v);

/** visitor_key for a channel conversation's ai_widget_visitors row and its session thread. */
export const channelVisitorKey = (zernioConversationId: string) => `zernio:${zernioConversationId}`;

/**
 * A reply someone typed in the WhatsApp Business phone app (coexistence). The visitor row's
 * handler columns must be set as a pair (chk_ai_widget_visitors_handler_pair), and this handler
 * is not a platform user.
 * ponytail: user id 0 is a sentinel; add a handled_via column if a second non-user handler appears.
 */
export const PHONE_APP_HANDLER = { id: 0, name: "WhatsApp Business app" } as const;

/** WhatsApp's customer-service window: free-form replies only within 24h of the customer's last message. */
export const WHATSAPP_WINDOW_MS = 24 * 60 * 60_000;

export interface AiConfig {
  capabilities: { answer: boolean; programs: boolean; collect: boolean; recommend: boolean; escalate: boolean };
  /** Team members may take over conversations on this channel. */
  takeover: boolean;
  escalation: { human: boolean; unsure: boolean; sensitive: boolean };
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  capabilities: { answer: true, programs: true, collect: true, recommend: true, escalate: true },
  takeover: true,
  escalation: { human: true, unsure: true, sensitive: true },
};

/** A stored ai_config merged over the defaults, so a key added later is never undefined. */
export function aiConfigOf(stored: unknown): AiConfig {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<AiConfig>;
  return {
    capabilities: { ...DEFAULT_AI_CONFIG.capabilities, ...(s.capabilities ?? {}) },
    takeover: s.takeover ?? DEFAULT_AI_CONFIG.takeover,
    escalation: { ...DEFAULT_AI_CONFIG.escalation, ...(s.escalation ?? {}) },
  };
}

export const CHANNEL_QUEUES = {
  /** One message per stored Zernio webhook event: { eventRowId }. */
  EVENTS: "channel_events",
} as const;
