import { Search, CheckCircle, Stamp, CalendarDays, type LucideIcon } from "lucide-react";

/** Icon colours are V1's: primary, emerald-600, amber-600, violet-600 on a plain glyph — no tinted square. */
export const QUICK_ACTIONS: { label: string; href: string; icon: LucideIcon; color: string }[] = [
  { label: "Search services", href: "/personal/explore", icon: Search, color: "text-primary" },
  { label: "Check eligibility", href: "/personal/explore", icon: CheckCircle, color: "text-emerald-600" },
  { label: "Visa matcher", href: "/personal/explore", icon: Stamp, color: "text-amber-600" },
  { label: "Browse events", href: "/personal/explore", icon: CalendarDays, color: "text-violet-600" },
];
