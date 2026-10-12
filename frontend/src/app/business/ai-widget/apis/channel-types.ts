/** WhatsApp, Instagram and Facebook on a visitor row — the Inbox's omnichannel fields. */
export type InboxChannel = "ai_embed" | "whatsapp" | "instagram" | "facebook";
export type AttentionReason = "ai_unsure" | "sensitive" | "other_app" | "suggest";

export type ChannelFields = {
  /** Omnichannel (20261008_001); absent on an older schema, which means the website widget. */
  channel?: InboxChannel;
  channel_handle?: string | null; // the customer's number or @handle there
  channel_connection_id?: number | null; // the Channels page's connection id
  last_inbound_at?: string | null; // WhatsApp's 24-hour window runs from here
  attention_reason?: AttentionReason | null; // why AI flagged it (asking for a person = handoff_requested_at)
  ai_draft?: string | null; // suggest-only mode: AI's reply for a person to send
  starred?: boolean; // this user's own star
};
