import type { LucideIcon } from "lucide-react";
import { Bot, Building2, Home, Inbox } from "lucide-react";

export type BusinessNavItem = { icon: LucideIcon; label: string; href: string };
export type BusinessNavGroup = { icon: LucideIcon; label: string; items: BusinessNavItem[] };

// Ported from V1's group-tab header (BusinessLayout.tsx's allBusinessNavGroups) — trimmed to
// destinations that actually exist as routes in V3 today. V1's Branches/Team/Services live as
// separate pages there; in V3 they're tabs inside the Business Profile page itself, so they
// aren't listed here as a second nav tier. A group's `items` array can grow past one entry
// later without any header changes — BusinessGroupNav only renders the sub-nav row once a
// group actually has more than one page.
export const BUSINESS_NAV_GROUPS: BusinessNavGroup[] = [
  { icon: Home, label: "Home", items: [{ icon: Home, label: "Home", href: "/business/portal" }] },
  { icon: Building2, label: "Business", items: [{ icon: Building2, label: "Business Profile", href: "/business/profile" }] },
  { icon: Inbox, label: "Enquiries", items: [{ icon: Inbox, label: "Enquiries", href: "/business/enquiries" }] },
  { icon: Bot, label: "AI Widget", items: [{ icon: Bot, label: "AI Widget", href: "/business/ai-widget" }] },
];
