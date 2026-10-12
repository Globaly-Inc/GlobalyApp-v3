import { Bot, CircleCheck, Globe, Inbox, Mail, Star, TriangleAlert, Users, type LucideIcon } from "lucide-react";
import type { InboxChannel } from "@/app/business/ai-widget/apis/types";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "../components/brand-icons";

/** Where "Connect a channel" goes. */
export const CHANNELS_HREF = "/business/messages/channels";

const BRAND_TILE = "bg-white ring-1 ring-inset ring-border";

/**
 * Every Inbox channel's name, icon and tint — the Channels page's tints, so a channel looks the
 * same wherever it appears. WhatsApp, Instagram and Facebook show their real logos in brand colour
 * on a white tile. Colour lives only in these small tiles, never in large fills.
 */
export const INBOX_CHANNELS: Record<InboxChannel, { label: string; icon: LucideIcon | typeof FacebookIcon; tint: string }> = {
  ai_embed: { label: "AI Embed", icon: Globe, tint: "bg-primary/10 text-primary" },
  whatsapp: { label: "WhatsApp", icon: WhatsAppIcon, tint: BRAND_TILE },
  instagram: { label: "Instagram", icon: InstagramIcon, tint: BRAND_TILE },
  facebook: { label: "Facebook", icon: FacebookIcon, tint: BRAND_TILE },
};

export const INBOX_CHANNEL_ORDER: InboxChannel[] = ["ai_embed", "whatsapp", "instagram", "facebook"];

export type InboxView = "attention" | "human" | "ai" | "unread" | "starred" | "all" | "resolved";

/** The Inbox sidebar's views, in its order. No "Assigned to me": the Inbox has no assignment. */
export const INBOX_VIEWS: { value: InboxView; label: string; icon: LucideIcon; hint: string }[] = [
  { value: "attention", label: "Needs attention", icon: TriangleAlert, hint: "Aly handed these over. Reply first." },
  { value: "human", label: "With team", icon: Users, hint: "Someone on your team is replying." },
  { value: "ai", label: "AI handling", icon: Bot, hint: "Aly is answering these. Nothing to do." },
  { value: "unread", label: "Unread", icon: Mail, hint: "New messages since you last looked." },
  { value: "starred", label: "Starred", icon: Star, hint: "Conversations you starred." },
  { value: "all", label: "All conversations", icon: Inbox, hint: "Everything, with what needs you first." },
  { value: "resolved", label: "Resolved", icon: CircleCheck, hint: "Closed. AI picks one up again if the customer writes." },
];
