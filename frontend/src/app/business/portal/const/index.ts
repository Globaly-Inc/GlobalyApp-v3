import { Inbox, Package, Sparkles, type LucideIcon } from "lucide-react";

export const QUICK_ACTIONS: { label: string; href: string; icon: LucideIcon; tint: string }[] = [
  { label: "Enquiry inbox", href: "/business/enquiries", icon: Inbox, tint: "bg-primary/10 text-primary ring-primary/15" },
  { label: "Manage profile & services", href: "/business/profile", icon: Package, tint: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/15 dark:text-emerald-400" },
  { label: "AI assistant", href: "/business/ai-widget", icon: Sparkles, tint: "bg-violet-500/10 text-violet-600 ring-violet-500/15 dark:text-violet-400" },
];

export const HERO_WIDGET_KEY = "business-home-widget";
export const TIMEZONE_KEY = "business-timezone";
export const WORLD_CLOCKS_KEY = "business-world-clocks";

/** Including the business's own zone, which always leads the row. Keeps the hero one line on a laptop. */
export const MAX_WORLD_CLOCKS = 5;
