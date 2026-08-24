import type { LucideIcon } from "lucide-react";
import { BookOpen, Building2, GraduationCap, Home, MapPin, Megaphone, PenLine, Settings, Users } from "lucide-react";

export type BusinessNavItem = { icon: LucideIcon; label: string; href: string };
export type BusinessNavGroup = { icon: LucideIcon; label: string; items: BusinessNavItem[] };

// Ported from V1's group-tab header (BusinessLayout.tsx's allBusinessNavGroups): the Business
// group is exactly Business Profile, Branches, Team, Services, Scholarships — no Partners or
// Activity, which don't exist in V1. In V3 they're tabs inside the Business Profile page
// (`?tab=`) rather than separate routes, so the nav items below link to that page with the tab
// preset. The sidebar is the only tab switcher — the page itself renders no second,
// in-content tab strip.
export const BUSINESS_NAV_GROUPS: BusinessNavGroup[] = [
  { icon: Home, label: "Home", items: [{ icon: Home, label: "Home", href: "/business/portal" }] },
  {
    icon: Building2,
    label: "Business",
    items: [
      { icon: Building2, label: "Business Profile", href: "/business/profile" },
      { icon: MapPin, label: "Branches", href: "/business/profile?tab=branches" },
      { icon: Users, label: "Team", href: "/business/profile?tab=team" },
      { icon: BookOpen, label: "Services", href: "/business/profile?tab=services" },
      { icon: GraduationCap, label: "Scholarships", href: "/business/profile?tab=scholarships" },
    ],
  },
  // No features behind these yet — each routes to a ComingSoon placeholder until built.
  { icon: Megaphone, label: "Marketing", items: [{ icon: Megaphone, label: "Marketing", href: "/business/marketing" }] },
  { icon: PenLine, label: "Scribe", items: [{ icon: PenLine, label: "Scribe", href: "/business/scribe" }] },
  { icon: GraduationCap, label: "LMS", items: [{ icon: GraduationCap, label: "LMS", href: "/business/lms" }] },
  { icon: Settings, label: "Settings", items: [{ icon: Settings, label: "Settings", href: "/business/settings" }] },
];
