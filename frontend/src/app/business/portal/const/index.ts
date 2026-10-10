
/** `object` is a 3D icon in `public/objects/`. */
export const QUICK_ACTIONS: { label: string; href: string; object: string }[] = [
  { label: "Enquiry inbox", href: "/business/enquiries", object: "inbox" },
  { label: "Manage profile & services", href: "/business/profile", object: "campus" },
  { label: "AI assistant", href: "/business/ai-widget", object: "sparkle" },
];

export const HERO_WIDGET_KEY = "business-home-widget";
export const TIMEZONE_KEY = "business-timezone";
export const WORLD_CLOCKS_KEY = "business-world-clocks";

export const EXTRACTION_POLL_INTERVAL_MS = 4000;
export const EXTRACTION_MAX_POLLS = 150;
/** Including the business's own zone, which always leads the row. Keeps the hero one line on a laptop. */
export const MAX_WORLD_CLOCKS = 5;
