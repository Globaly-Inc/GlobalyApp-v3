import {
  Search, ShieldCheck, Plane, CalendarDays,
  type LucideIcon,
} from "lucide-react";

export const QUICK_ACTIONS: { label: string; href: string; icon: LucideIcon; tint: string }[] = [
  // "Search services" points at the portal search, matching the nav item with the same label.
  // V2 sent this one to the public /search while the nav went to /personal/search.
  { label: "Search services", href: "/personal/explore", icon: Search, tint: "bg-primary/10 text-primary" },
  { label: "Check eligibility", href: "/personal/explore", icon: ShieldCheck, tint: "bg-success/10 text-success" },
  { label: "Visa matcher", href: "/personal/explore", icon: Plane, tint: "bg-warning/10 text-warning" },
  { label: "Browse events", href: "/personal/explore", icon: CalendarDays, tint: "bg-info/10 text-info" },
];

