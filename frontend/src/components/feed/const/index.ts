import { Users, Megaphone, RefreshCw, MessageSquare, type LucideIcon } from "lucide-react";

export const FEED_FILTERS = [
  { value: "all", label: "All" },
  { value: "social", label: "Social" },
  { value: "promotion", label: "Promotions" },
  { value: "update", label: "Updates" },
  { value: "announcement", label: "Announcements" },
];

export const POST_TYPES: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "social", label: "Social", icon: Users },
  { value: "promotion", label: "Promotion", icon: Megaphone },
  { value: "update", label: "Update", icon: RefreshCw },
  { value: "announcement", label: "Announcement", icon: MessageSquare },
];

/**
 * Only the audiences V3 can actually enforce (see the feed visibility matrix). V2's composer also offered
 * "My Students / My Representatives / My Ambassadors"; those relations do not exist in V3 yet, and shipping
 * them as labels that silently resolve to "everyone" would misrepresent who can see a post.
 */
export const VISIBILITY_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "private", label: "Only me" },
];

export const MAX_POST_LENGTH = 5000;
export const MAX_MEDIA = 4;

export const DEFAULT_REACTION = "👍";

/** Offered in the reaction picker. The API accepts any emoji, so this is presentation, not a constraint. */
export const REACTION_CHOICES = ["👍", "❤️", "🎉", "👏", "😮", "😢", "😡", "🔥", "🙏", "😂"];

/**
 * Per-type accent: the left border stripe and the badge. One colour per post type so the type is readable
 * before the text is.
 */
export const POST_TYPE_STYLES: Record<string, { accent: string; badge: string; label: string }> = {
  social: {
    accent: "border-l-success",
    badge: "bg-success/10 text-success",
    label: "Social",
  },
  promotion: {
    accent: "border-l-warning",
    badge: "bg-warning/10 text-warning",
    label: "Promotion",
  },
  update: {
    accent: "border-l-info",
    badge: "bg-info/10 text-info",
    label: "Update",
  },
  announcement: {
    accent: "border-l-primary",
    badge: "bg-primary/10 text-primary",
    label: "Announcement",
  },
};

export const VISIBILITY_LABELS: Record<string, string> = {
  everyone: "Everyone",
  business: "My business",
  private: "Only me",
};

/** Above this, the body is clamped behind a "Read more" toggle. */
export const POST_CLAMP_CHARS = 320;
