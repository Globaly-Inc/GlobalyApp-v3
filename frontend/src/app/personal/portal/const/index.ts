import {
  Search, ShieldCheck, Plane, CalendarDays,
  Users, Megaphone, RefreshCw, MessageSquare,
  type LucideIcon,
} from "lucide-react";

export const QUICK_ACTIONS: { label: string; href: string; icon: LucideIcon; tint: string }[] = [
  // "Search services" points at the portal search, matching the nav item with the same label.
  // V2 sent this one to the public /search while the nav went to /personal/search.
  { label: "Search services", href: "/personal/explore", icon: Search, tint: "bg-primary/10 text-primary" },
  { label: "Check eligibility", href: "/personal/explore", icon: ShieldCheck, tint: "bg-emerald-500/10 text-emerald-600" },
  { label: "Visa matcher", href: "/personal/explore", icon: Plane, tint: "bg-amber-500/10 text-amber-600" },
  { label: "Browse events", href: "/personal/explore", icon: CalendarDays, tint: "bg-violet-500/10 text-violet-600" },
];

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
export const REACTION_CHOICES = ["👍", "❤️", "🎉", "👏", "😮", "😢"];

/**
 * Per-type accent: the left border stripe and the badge. One colour per post type so the type is readable
 * before the text is.
 */
export const POST_TYPE_STYLES: Record<string, { accent: string; badge: string; label: string }> = {
  social: {
    accent: "border-l-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    label: "Social",
  },
  promotion: {
    accent: "border-l-orange-500",
    badge: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    label: "Promotion",
  },
  update: {
    accent: "border-l-cyan-500",
    badge: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
    label: "Update",
  },
  announcement: {
    accent: "border-l-blue-500",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
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

export const HERO_WIDGET_KEY = "personal-home-widget";
export const TIMEZONE_KEY = "personal-timezone";
export const WORLD_CLOCKS_KEY = "personal-world-clocks";

/** Including the user's own zone, which always leads the row. Keeps the hero one line on a laptop. */
export const MAX_WORLD_CLOCKS = 5;
