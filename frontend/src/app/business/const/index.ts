import type { LucideIcon } from "lucide-react";
import { Award, Bot, BookOpen, Building2, CalendarDays, CreditCard, Coins, GraduationCap, Handshake, Home, MapPin, Megaphone, MessageSquare, PenLine, Plug, Receipt, Settings, Users } from "lucide-react";

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
  {
    icon: Megaphone,
    label: "Marketing",
    items: [
      { icon: MessageSquare, label: "Enquiries", href: "/business/enquiries" },
      { icon: Handshake, label: "Representations", href: "/business/marketing/representations" },
      { icon: CalendarDays, label: "Events", href: "/business/marketing/events" },
      { icon: Award, label: "Ambassadors", href: "/business/marketing/ambassadors" },
      { icon: Megaphone, label: "Ads", href: "/business/marketing/ads" },
    ],
  },
  { icon: PenLine, label: "Scribe", items: [{ icon: PenLine, label: "Scribe", href: "/business/scribe" }] },
  { icon: GraduationCap, label: "LMS", items: [{ icon: GraduationCap, label: "LMS", href: "/business/lms" }] },
  {
    icon: Settings,
    label: "Settings",
    items: [
      { icon: CreditCard, label: "Subscription", href: "/business/settings/subscription" },
      { icon: Coins, label: "Credits", href: "/business/settings/credits" },
      { icon: Receipt, label: "Application charges", href: "/business/settings/application-charges" },
      { icon: Plug, label: "Integrations", href: "/business/settings/integrations" },
      { icon: Bot, label: "AI embed", href: "/business/settings/ai-embed" },
    ],
  },
  { icon: MessageSquare, label: "Messages", items: [{ icon: MessageSquare, label: "Messages", href: "/business/messages" }],
},
];

export function withBusinessId(groups: BusinessNavGroup[], businessId: number | null): BusinessNavGroup[] {
  if (businessId == null) return groups;
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      const [path, query] = item.href.split("?");
      if (path !== "/business/profile") return item;
      const querySuffix = query ? `?${query}` : "";
      return { ...item, href: `/business/profile/${businessId}${querySuffix}` };
    }),
  }));
}
