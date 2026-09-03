import {
  Search, ShieldCheck, Plane, CalendarDays,
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

export const HERO_WIDGET_KEY = "personal-home-widget";
export const TIMEZONE_KEY = "personal-timezone";
export const WORLD_CLOCKS_KEY = "personal-world-clocks";

/** Including the user's own zone, which always leads the row. Keeps the hero one line on a laptop. */
export const MAX_WORLD_CLOCKS = 5;
