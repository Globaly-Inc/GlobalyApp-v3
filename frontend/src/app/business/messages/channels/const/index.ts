import type { AiConfig, ChannelKey } from "../apis/types";

/** The channels connected through Zernio, in the order the Channels page shows them. */
export const CHANNEL_CARDS: { key: ChannelKey; description: string; need: string; noun: string }[] = [
  {
    key: "whatsapp",
    description: "AI answers WhatsApp Business messages. Your team takes over from the Inbox.",
    need: "Admin access to your WhatsApp Business account in Meta Business Manager.",
    noun: "WhatsApp Business number",
  },
  {
    key: "instagram",
    description: "AI answers Instagram DMs from your connected page. Your team takes over from the Inbox.",
    need: "An Instagram Professional account linked to a Facebook Page you manage.",
    noun: "Instagram Professional account",
  },
  {
    key: "facebook",
    description: "AI answers Messenger conversations on your Facebook Page. Your team takes over from the Inbox.",
    need: "Admin access to the Facebook Page your customers message.",
    noun: "Facebook Page",
  },
];

export const DEFAULT_AI_CONFIG: AiConfig = {
  capabilities: { answer: true, programs: true, collect: true, recommend: true, escalate: true },
  takeover: true,
  escalation: { human: true, unsure: true, sensitive: true },
};

/** AI configuration's checkboxes: label, and an optional line explaining it. */
export const CAPABILITY_FIELDS: { key: keyof AiConfig["capabilities"]; label: string; hint?: string }[] = [
  { key: "answer", label: "Answer customer questions" },
  { key: "programs", label: "Provide program information" },
  { key: "collect", label: "Collect customer information", hint: "Name, email, destination, course and intake go to the visitor's record" },
  { key: "recommend", label: "Recommend relevant programs" },
  { key: "escalate", label: "Escalate to a human when necessary" },
];

export const ESCALATION_FIELDS: { key: keyof AiConfig["escalation"]; label: string; hint?: string }[] = [
  { key: "human", label: "Customer asks for a human" },
  { key: "unsure", label: "AI is unsure", hint: "For example visa chances, guarantees, or the status of their application" },
  { key: "sensitive", label: "Sensitive question", hint: "Refusals, complaints, legal or personal hardship" },
];
