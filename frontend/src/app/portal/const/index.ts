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
 * Audiences a composer may offer. Every value here is enforced server-side in the feed's list query — the
 * selector never offers an audience the backend only labels.
 *
 * Only "everyone" crosses between a user's personal and business portals. Anything narrower stays in the
 * portal it was written from, which is why each portal gets its own list rather than one shared one.
 */
export const VISIBILITY_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "students", label: "Students only" },
];

/**
 * The business composer. "My business" (visibility "business") is offered here and nowhere else — it is
 * the audience that only makes sense once you are posting as a business.
 *
 * V1 also offered "My Representatives" and "My Ambassadors". Neither is offered here: V3 has no audience
 * table the list query could enforce them against, and in V1 they were labels with no enforcement behind
 * them. They need a backend audience definition before they can be honestly shown.
 */
export const BUSINESS_VISIBILITY_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "students", label: "My students" },
  { value: "business", label: "My business" },
];

export const MAX_POST_LENGTH = 5000;
export const MAX_MEDIA = 4;

export const DEFAULT_REACTION = "👍";

/** Offered in the reaction picker. The API accepts any emoji, so this is presentation, not a constraint. */
export const REACTION_CHOICES = ["👍", "❤️", "🎉", "👏", "😮", "😢"];

/**
 * Per-type styling, taken from V1's FeedPostCard POST_TYPE_CONFIG: a 500-weight accent on the left border
 * and a /10 tinted badge in the same hue, with the type's icon inside the badge.
 */
export const POST_TYPE_STYLES: Record<
  string,
  { accent: string; badge: string; label: string; icon: LucideIcon }
> = {
  social: { accent: "border-l-green-500", badge: "bg-green-500/10 text-green-500", label: "Social", icon: Users },
  promotion: { accent: "border-l-orange-500", badge: "bg-orange-500/10 text-orange-500", label: "Promotion", icon: Megaphone },
  update: { accent: "border-l-cyan-500", badge: "bg-cyan-500/10 text-cyan-500", label: "Update", icon: RefreshCw },
  announcement: { accent: "border-l-blue-500", badge: "bg-blue-500/10 text-blue-500", label: "Announcement", icon: MessageSquare },
};

/** Every value the API can return, so a post never renders with a raw enum string. */
export const VISIBILITY_LABELS: Record<string, string> = {
  everyone: "Everyone",
  students: "Students only",
  business: "My business",
  private: "Only me",
};

/** Above this, the body is clamped behind a "Read more" toggle. */
export const POST_CLAMP_CHARS = 320;

export const HERO_WIDGET_KEY = "portal-home-widget";
export const TIMEZONE_KEY = "portal-timezone";
export const WORLD_CLOCKS_KEY = "portal-world-clocks";

/** Including the user's own zone, which always leads the row. Keeps the hero one line on a laptop. */
export const MAX_WORLD_CLOCKS = 5;
