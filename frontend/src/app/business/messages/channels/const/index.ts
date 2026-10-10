import { Camera, MessageCircle } from "lucide-react";

/**
 * Channels the Inbox will take messages from. None can be connected yet, so each is shown for
 * what it will do, marked Coming soon, with nothing to click.
 */
export const UPCOMING_CHANNELS = [
  {
    key: "whatsapp",
    name: "WhatsApp",
    description: "Reply to WhatsApp Business messages from your Inbox.",
    icon: MessageCircle,
    tint: "bg-green-500/10 text-green-700",
  },
  {
    key: "instagram",
    name: "Instagram",
    description: "Manage Instagram DMs from your connected page.",
    icon: Camera,
    tint: "bg-pink-500/10 text-pink-600",
  },
] as const;
