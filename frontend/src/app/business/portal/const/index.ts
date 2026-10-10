import { Bot, UserSearch, Wand2, type LucideIcon } from "lucide-react";

/** `object` is a 3D icon in `public/objects/`. */
export const QUICK_ACTIONS: { label: string; href: string; object: string }[] = [
  // Hidden for the short release (Enquiries is off the sidebar too):
  // { label: "Enquiry inbox", href: "/business/enquiries", object: "inbox" },
  { label: "Manage profile & services", href: "/business/profile", object: "campus" },
  { label: "AI assistant", href: "/business/messages/widget", object: "sparkle" },
];

/**
 * The three features the welcome screen leads with, in the order an owner meets them: fill the
 * profile, answer students, follow up leads. Each is live in the portal today (extraction card,
 * AI embed widget, Visitors tab + inbox) — nothing here may point at a "coming soon" page.
 */
export const WELCOME_FEATURES: { id: "autofill" | "counsellor" | "leads"; icon: LucideIcon; tag: string; label: string; description: string }[] = [
  {
    id: "autofill",
    icon: Wand2,
    tag: "Set up",
    label: "Auto-filled profile",
    description: "Share your website and we pull in your courses, fees and intakes. You review it before anything goes live.",
  },
  {
    id: "counsellor",
    icon: Bot,
    tag: "Engage",
    label: "AI counsellor",
    description: "Answers student questions on your website around the clock, trained on your own content.",
  },
  {
    id: "leads",
    icon: UserSearch,
    tag: "Convert",
    label: "Leads and visitor insights",
    description: "See what each visitor is looking for. Those who share their details become leads to follow up.",
  },
];

export const HERO_WIDGET_KEY = "business-home-widget";
export const TIMEZONE_KEY = "business-timezone";
export const WORLD_CLOCKS_KEY = "business-world-clocks";

/** What a crawl collects. Named in the same order wherever it is listed, so the promise made before
 *  it runs and the counts reported while it runs read as one list. */
export const EXTRACTION_CATEGORIES = [
  "Courses", "Branches", "Fees", "Intakes", "Eligibility",
  "Scholarships", "Study units", "Study options", "Accreditations", "Agents",
] as const;

export const EXTRACTION_POLL_INTERVAL_MS = 4000;
export const EXTRACTION_MAX_POLLS = 150;
/** Job statuses after which the crawl is over — the portal unlocks on any of them. */
export const EXTRACTION_TERMINAL_STATUSES = new Set(["done", "exported", "approved", "verified", "review", "failed", "declined"]);
/** Including the business's own zone, which always leads the row. Keeps the hero one line on a laptop. */
export const MAX_WORLD_CLOCKS = 5;
