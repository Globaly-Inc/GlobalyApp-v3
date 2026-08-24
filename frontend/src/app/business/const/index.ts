import type { LucideIcon } from "lucide-react";
import { Bot, Briefcase, Building2, CalendarDays, CreditCard, Home, Inbox, Megaphone, Plug, Speaker, Users } from "lucide-react";

export type BusinessNavItem = { icon: LucideIcon; label: string; href: string };
export type BusinessNavGroup = { icon: LucideIcon; label: string; items: BusinessNavItem[] };

// Grouping matches the reference app's BusinessLayout.tsx (allBusinessNavGroups) exactly —
// Home / Business / Marketing / Scribe / LMS / Settings — not a V3 invention. V1's
// Branches/Team/Services are separate pages there; in V3 they're tabs inside the Business
// Profile page itself (see profile/[businessId]), so "Business" legitimately has one nav item
// here even though the reference lists five — same for Representations, which is a tab there
// too. Scribe and LMS groups are omitted until those pages exist; add them back with their real
// hrefs once built rather than pointing a nav tab at nothing.
export const BUSINESS_NAV_GROUPS: BusinessNavGroup[] = [
  { icon: Home, label: "Home", items: [{ icon: Home, label: "Home", href: "/business/portal" }] },
  { icon: Building2, label: "Business", items: [{ icon: Building2, label: "Business Profile", href: "/business/profile" }] },
  {
    icon: Megaphone,
    label: "Marketing",
    items: [
      { icon: Inbox, label: "Enquiries", href: "/business/enquiries" },
      { icon: CalendarDays, label: "Events", href: "/business/events" },
      { icon: Users, label: "Ambassadors", href: "/business/ambassadors" },
      { icon: Speaker, label: "Ads", href: "/business/ads" },
      // Jobs isn't in the reference app's nav groups either (routes exist, no group links to
      // them) — grouped here under Marketing as a V3 IA decision, not a verified 1:1 port.
      { icon: Briefcase, label: "Jobs", href: "/business/jobs" },
    ],
  },
  {
    icon: CreditCard,
    label: "Settings",
    items: [
      { icon: CreditCard, label: "Billing", href: "/business/billing" },
      { icon: Plug, label: "Integrations", href: "/business/integrations" },
      { icon: Bot, label: "AI Widget", href: "/business/ai-widget" },
    ],
  },
];
