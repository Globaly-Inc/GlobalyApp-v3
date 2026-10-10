import type { LucideIcon } from "lucide-react";
import { BookOpen, Brain, Building2, Contact, GraduationCap, Globe, Handshake, Home, Inbox, MapPin, Settings, UserSearch, Users } from "lucide-react";

export type BusinessNavItem = { icon: LucideIcon; label: string; href: string };
export type BusinessNavGroup = { icon: LucideIcon; label: string; items: BusinessNavItem[]; pinBottom?: boolean; alwaysShowSubmenu?: boolean };

// Ported from V1's group-tab header (BusinessLayout.tsx's allBusinessNavGroups): the Business
// group is exactly Business Profile, Branches, Team, Services, Scholarships — no Partners or
// Activity, which don't exist in V1. In V3 they're tabs inside the Business Profile page
// (`?tab=`) rather than separate routes, so the nav items below link to that page with the tab
// preset. The sidebar is the only tab switcher — the page itself renders no second,
// in-content tab strip.
export const BUSINESS_NAV_GROUPS: BusinessNavGroup[] = [
  { icon: Home, label: "Home", items: [{ icon: Home, label: "Home", href: "/business/portal" }] },
  // Commented out for now — not ready to ship yet.
  // { icon: Share2, label: "Social", items: [{ icon: Share2, label: "Social", href: "/business/social" }] },
  {
    icon: Building2,
    label: "Business",
    items: [
      { icon: Building2, label: "Business Profile", href: "/business/profile" },
      { icon: MapPin, label: "Branches", href: "/business/profile?tab=branches" },
      { icon: Handshake, label: "Representative", href: "/business/profile?tab=partners" },
      { icon: Users, label: "Team", href: "/business/profile?tab=team" },
      { icon: BookOpen, label: "Services", href: "/business/profile?tab=services" },
      { icon: Globe, label: "Site contents", href: "/business/profile?tab=site_mapping" },
    ],
  },
  // Hidden for the short release — uncomment (and re-add their icon imports) to bring them back.
  // {
  //   icon: Megaphone,
  //   label: "Marketing",
  //   items: [
  //     { icon: MessageSquare, label: "Enquiries", href: "/business/enquiries" },
  //     { icon: Handshake, label: "Representations", href: "/business/marketing/representations" },
  //     { icon: CalendarDays, label: "Events", href: "/business/marketing/events" },
  //     { icon: Award, label: "Ambassadors", href: "/business/marketing/ambassadors" },
  //     { icon: Megaphone, label: "Ads", href: "/business/marketing/ads" },
  //   ],
  // },
  // { icon: PenLine, label: "Scribe", items: [{ icon: PenLine, label: "Scribe", href: "/business/scribe" }] },
  // { icon: GraduationCap, label: "LMS", items: [{ icon: GraduationCap, label: "LMS", href: "/business/lms" }] },
  // People who reached the org — the widget's visitors and leads for now.
  // alwaysShowSubmenu: one item today, but the sub-menu names what the list is (and has room for more).
  {
    icon: Contact,
    label: "Contacts",
    alwaysShowSubmenu: true,
    items: [{ icon: UserSearch, label: "Visitors", href: "/business/contacts/visitors" }],
  },
  // Second to last, Settings last. Widget settings are reached from the Inbox's ⚙ Widget button.
  { icon: Inbox, label: "Inbox", items: [{ icon: Inbox, label: "Inbox", href: "/business/messages" }] },
  {
    icon: Settings,
    label: "Settings",
    pinBottom: true, // bottom of the rail
    alwaysShowSubmenu: true,
    items: [
      // Hidden for the short release:
      // { icon: CreditCard, label: "Subscription", href: "/business/settings/subscription" },
      // { icon: Coins, label: "Credits", href: "/business/settings/credits" },
      // { icon: Receipt, label: "Application charges", href: "/business/settings/application-charges" },
      // { icon: Plug, label: "Integrations", href: "/business/settings/integrations" },
      // "AI embed" moved: widget settings are reached from the Inbox's ⚙ Widget button.
      // Institution-only on the backend (requireInstitutionContext). The page says so
      // itself rather than vanishing from the sidebar — a business asking where its
      // counsellor's knowledge lives deserves the answer, not a missing menu item.
      { icon: Brain, label: "AI knowledge", href: "/business/ai-knowledge" },
    ],
  },
];

export const INSTITUTION_SCHOLARSHIPS_ITEM: BusinessNavItem = {
  icon: GraduationCap, label: "Scholarships", href: "/business/profile?tab=scholarships",
};

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
